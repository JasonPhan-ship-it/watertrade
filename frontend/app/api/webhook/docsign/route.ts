// app/api/webhook/docsign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SignatureProgress, TradeStatus, TransactionStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import {
  sendEmail,
  appUrl,
  renderSellerNeedsSignatureEmail,
  renderBuyerSignedAckEmail,
  renderFullyExecutedEmail,
  renderBuyerAcceptedEmail,
} from "@/lib/email";
import { createBuyerSignatureLink } from "@/lib/trade";

let docusign: any = null;

function pickAcceptedPendingBuyerStatus(): (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_BUYER_SIGNATURE ??
    TS.ACCEPTED_PENDING_SIGNATURE ??
    TS.ACCEPTED ??
    TS.PENDING ??
    TS.OFFERED
  );
}

function pickTxnPendingBuyerSig(): (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return TXS.PENDING_BUYER_SIGNATURE ?? TXS.PENDING_SIGNATURE ?? TXS.PENDING ?? TXS.ACCEPTED ?? null;
}

async function resolveContact(userId?: string | null) {
  if (!userId) return { email: "", name: "" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, clerkId: true } });
  if (!user) return { email: "", name: "" };

  let { email = "", name = "" } = user;

  if ((!email || !name) && user.clerkId) {
    try {
      const clerkUser = await clerkClient.users.getUser(user.clerkId);
      name = name || clerkUser.firstName || clerkUser.username || "";
      const primary = clerkUser.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress;
      email = email || primary || clerkUser.emailAddresses?.[0]?.emailAddress || "";
    } catch {
      // ignore clerk lookup failures
    }
  }

  return { email, name };
}

/* ---------------- DocuSign auth + base ---------------- */
function normalizeOAuthBase(input?: string) {
  const raw = (input || "").trim() || "https://account-d.docusign.com";
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (!["account-d.docusign.com", "account.docusign.com"].includes(host)) {
    throw new Error(`DOCUSIGN_BASE_PATH must be account(-d).docusign.com; got ${host}`);
  }
  return { oauthBase: `https://${host}`, oauthHost: host };
}

function readPrivateKey(): string {
  const raw = process.env.DOCUSIGN_PRIVATE_KEY || "";
  const b64 = process.env.DOCUSIGN_PRIVATE_KEY_B64 || "";
  if (raw.includes("PRIVATE KEY")) return raw;
  if (b64) {
    const txt = Buffer.from(b64, "base64").toString("utf8");
    if (txt.includes("PRIVATE KEY")) return txt;
  }
  throw new Error("Missing DocuSign RSA private key");
}

async function loadDS() {
  if (docusign) return;
  docusign = await import("docusign-esign");
}

async function getAccess() {
  await loadDS();
  const { oauthHost } = normalizeOAuthBase(process.env.DOCUSIGN_BASE_PATH);
  const client = new docusign.ApiClient();
  client.setOAuthBasePath(oauthHost);
  const res = await client.requestJWTUserToken(
    process.env.DOCUSIGN_INTEGRATION_KEY!,
    process.env.DOCUSIGN_USER_ID!,
    ["signature", "impersonation"],
    readPrivateKey(),
    3600
  );
  const accessToken = res.body.access_token as string;

  const oauthBase = `https://${oauthHost}`;
  const ui = await fetch(`${oauthBase}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const info = await ui.json();
  const envAcct = (process.env.DOCUSIGN_ACCOUNT_ID || "").trim();
  const acct =
    (envAcct && (info.accounts || []).find((a: any) => a.account_id === envAcct)) ||
    info.accounts?.find((a: any) => a.is_default) ||
    info.accounts?.[0];
  if (!acct) throw new Error("No DocuSign account on token");
  const restBase = `${(acct.base_uri || acct.baseUri).replace(/\/+$/, "")}/restapi`;

  return { accessToken, accountId: acct.account_id as string, restBase };
}

async function mkEnvelopesApi(restBase: string, accessToken: string) {
  await loadDS();
  const api = new docusign.ApiClient();
  api.setBasePath(restBase);
  api.addDefaultHeader("Authorization", "Bearer " + accessToken);
  return new docusign.EnvelopesApi(api);
}

async function fetchCombinedPdfBase64(
  accountId: string,
  restBase: string,
  accessToken: string,
  envelopeId: string
) {
  const envelopesApi = await mkEnvelopesApi(restBase, accessToken);
  const file: any = await envelopesApi.getDocument(accountId, envelopeId, "combined", null);
  const buf: Buffer = Buffer.isBuffer(file) ? file : Buffer.from(file, "binary");
  return buf.toString("base64");
}

/* ---------------- Connect security: HMAC ---------------- */
async function verifyHmacFromBody(body: Buffer, headers: Headers) {
  const secret = (process.env.DOCUSIGN_CONNECT_HMAC_SECRET || "").trim();
  if (!secret) return true; // not configured → skip
  const sig = headers.get("x-docusign-signature-1");
  if (!sig) return false;
  const { createHmac } = await import("crypto");
  const key = Buffer.from(secret, "base64"); // DocuSign gives base64 key
  const h = createHmac("sha256", key).update(body).digest("base64");
  return h === sig;
}

/* ---------------- Payload helpers ---------------- */
function readEventType(payload: any): string {
  const raw =
    payload?.event?.eventType ||        // Connect v2
    payload?.eventType ||               // some variants
    payload?.envelopeStatus?.status ||  // legacy JSON path
    "";
  return String(raw).toLowerCase();     // e.g., "recipientcompleted" or "completed"
}

function extractRecipient(payload: any) {
  const r =
    payload?.recipient ||
    payload?.data?.recipient ||
    (payload?.recipientStatuses || [])[0] ||
    null;
  if (!r) return null;
  const email = (r.email || r.emailAddress || r.recipientEmail || "").toString();
  const name = (r.userName || r.name || r.recipientName || "").toString();
  const role = (r.roleName || r.role || "").toString();
  return { email, name, role };
}

function tryExtractEnvelopeId(payload: any, rawText: string): string | null {
  const fromJson =
    payload?.envelopeId ||
    payload?.envelopeSummary?.envelopeId ||
    payload?.data?.envelopeId ||
    payload?.envelopeStatus?.envelopeID ||
    null;
  if (fromJson) return String(fromJson);
  const m =
    rawText.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i) ||
    rawText.match(/<envelopeId>([^<]+)<\/envelopeId>/i);
  return m?.[1] || null;
}

/* ---------------- Trade/offer formatting ---------------- */
function toOfferSummary(trade: any) {
  return {
    listingTitle: trade.listing?.title || trade.listingTitle || (trade as any).windowLabel || `Trade ${trade.id}`,
    district: trade.district || "—",
    waterType: trade.waterType || null,
    volumeAf: trade.volumeAf || 0,
    pricePerAf: trade.pricePerAf || 0,
    // branded templates will render /AF
    priceLabel: undefined,
    windowLabel: (trade as any).windowLabel || undefined,
  };
}

/* ---------------- Resolve trade_id if payload omitted it ---------------- */
async function resolveTradeByEnvelopeCustomField(
  accountId: string,
  restBase: string,
  accessToken: string,
  envelopeId: string
) {
  const envelopesApi = await mkEnvelopesApi(restBase, accessToken);
  try {
    const fields = await envelopesApi.listCustomFields(accountId, envelopeId);
    const tcf: any[] = fields?.textCustomFields || [];
    const tradeId = (tcf.find(f => (f.name || "").toLowerCase() === "trade_id")?.value || "").trim();
    return tradeId || null;
  } catch {
    return null;
  }
}

/* ---------------- Route handlers ---------------- */
export async function POST(req: NextRequest) {
  try {
    // Read once (for HMAC + parsing)
    const bodyBuf = Buffer.from(await req.arrayBuffer());
    if (!(await verifyHmacFromBody(bodyBuf, req.headers))) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }
    const rawText = bodyBuf.toString("utf8");
    let payload: any = {};
    try { payload = rawText ? JSON.parse(rawText) : {}; } catch {}

    const type = readEventType(payload); // 'recipientcompleted' or 'completed' etc.
    const envelopeId = tryExtractEnvelopeId(payload, rawText);
    if (!envelopeId) return NextResponse.json({ ok: true, ignored: "no envelopeId" });

    // Correlate Trade
    let tradeId: string | null =
      payload?.customFields?.textCustomFields?.find?.((f: any) => f?.name === "trade_id")?.value ||
      payload?.data?.customFields?.find?.((f: any) => f?.name === "trade_id")?.value ||
      payload?.tradeId ||
      null;

    // Pull trade record if we already have id
    let trade =
      tradeId
        ? await prisma.trade.findUnique({
            where: { id: tradeId },
            include: {
              listing: { select: { title: true } },
              buyer:   { select: { email: true, name: true, id: true, clerkId: true } },
              seller:  { select: { email: true, name: true, id: true, clerkId: true } },
              transaction: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          })
        : null;

    // Fallback: ask DocuSign for custom fields
    if (!trade) {
      const { accessToken, accountId, restBase } = await getAccess();
      const cfTradeId = await resolveTradeByEnvelopeCustomField(accountId, restBase, accessToken, envelopeId);
      if (cfTradeId) {
        trade = await prisma.trade.findUnique({
          where: { id: cfTradeId },
          include: {
            listing: { select: { title: true } },
            buyer:   { select: { email: true, name: true, id: true, clerkId: true } },
            seller:  { select: { email: true, name: true, id: true, clerkId: true } },
            transaction: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });
        tradeId = cfTradeId;
      }
    }

    // If still no trade, acknowledge quietly (avoid DS retries)
    if (!trade) {
      console.warn("[docsign webhook] no trade found for envelope", { envelopeId });
      return NextResponse.json({ ok: true, envelopeId, ignored: "no trade" });
    }

    /* ================== recipient completed ================== */
    if (type.includes("recipient") && type.includes("completed")) {
      const r = extractRecipient(payload);
      const role = (r?.role || "").toLowerCase();
      const offer = toOfferSummary(trade);

      // Only act when the BUYER finishes: notify SELLER to sign + ACK BUYER with current PDF
      if (role.includes("buyer")) {
        const { accessToken, accountId, restBase } = await getAccess();
        const base64 = await fetchCombinedPdfBase64(accountId, restBase, accessToken, envelopeId);

        // Seller → please sign
        if (trade.seller?.email) {
          const { html, preheader } = renderSellerNeedsSignatureEmail({
            sellerName: trade.seller?.name,
            buyerName: trade.buyer?.name,
            offer,
            signLink: appUrl(`/sign/${trade.id}?role=seller`),
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.seller.email,
            subject: "Please review & sign",
            html,
            preheader,
            idempotencyKey: `ds:${envelopeId}:notify-seller`,
          });
        }

        // Buyer → ack + their current signed copy
        if (trade.buyer?.email) {
          const { html, preheader } = renderBuyerSignedAckEmail({
            buyerName: trade.buyer?.name,
            sellerName: trade.seller?.name,
            offer,
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.buyer.email,
            subject: "We’ve recorded your signature — copy attached",
            html,
            preheader,
            attachments: [
              {
                filename: `WaterTraders_Agreement_${trade.id}_buyer_signed.pdf`,
                content: base64,
                contentType: "application/pdf",
              },
            ],
            idempotencyKey: `ds:${envelopeId}:ack-buyer`,
          });
        }
      }

      if (role.includes("seller")) {
        const sellerStatus = String((trade as any)?.sellerSignStatus || "").toUpperCase();
        const buyerStatus = String((trade as any)?.buyerSignStatus || "").toUpperCase();
        const alreadyHandled = sellerStatus === "SIGNED" && buyerStatus !== "NONE";
        if (alreadyHandled) {
          return NextResponse.json({ ok: true, handled: "recipientCompletedSellerAlready", envelopeId });
        }

        let buyerSignLink = appUrl(
          `/sign/${trade.id}?role=buyer${(trade as any)?.buyerToken ? `&token=${(trade as any)?.buyerToken}` : ""}`
        );
        try {
          buyerSignLink = await createBuyerSignatureLink(trade.id, (trade as any)?.buyerToken);
        } catch (err) {
          console.error("[docsign webhook] createBuyerSignatureLink failed", err);
        }

        const updated = await prisma.trade.update({
          where: { id: trade.id },
          data: {
            status: pickAcceptedPendingBuyerStatus(),
            sellerSignStatus: SignatureProgress.SIGNED,
            buyerSignStatus: SignatureProgress.REQUESTED,
            buyerSignUrl: buyerSignLink,
            sellerSignUrl: null,
            events: {
              create: {
                id: randomUUID(),
                actor: "seller",
                kind: "SELLER_SIGNED",
                payload: {
                  previousStatus: (trade as any)?.status,
                  sellerSignStatus: (trade as any)?.sellerSignStatus,
                  buyerSignStatus: (trade as any)?.buyerSignStatus,
                },
              },
            },
          },
          select: {
            id: true,
            buyerUserId: true,
            sellerUserId: true,
            buyerToken: true,
            sellerToken: true,
            transactionId: true,
            district: true,
            waterType: true,
            volumeAf: true,
            pricePerAf: true,
            windowLabel: true,
          },
        });

        if (updated.transactionId) {
          try {
            const nextTxnStatus = pickTxnPendingBuyerSig();
            if (nextTxnStatus) {
              await prisma.transaction.update({
                where: { id: updated.transactionId },
                data: { status: nextTxnStatus },
              });
            }
          } catch (err) {
            console.warn("[docsign webhook] transaction update failed", (err as any)?.message);
          }
        }

        const [{ email: buyerEmail, name: buyerName }, { email: sellerEmail, name: sellerName }] = await Promise.all([
          resolveContact(updated.buyerUserId),
          resolveContact(updated.sellerUserId),
        ]);

        const buyerViewLink = appUrl(
          `/t/${updated.id}?role=buyer${updated.buyerToken ? `&token=${updated.buyerToken}` : ""}&action=awaiting-buyer-signature`
        );

        if (buyerEmail) {
          const { html, preheader } = renderBuyerAcceptedEmail({
            buyerName,
            sellerName,
            offer,
            signLink: buyerSignLink,
            viewLink: buyerViewLink,
          });
          try {
            await sendEmail({
              to: buyerEmail,
              subject: "Seller signed — your turn to sign",
              html,
              preheader,
            });
          } catch (err) {
            console.warn("[docsign webhook] buyer notification failed", (err as any)?.message);
          }
        }

        if (sellerEmail) {
          const sellerViewLink = appUrl(
            `/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}`
          );
          const html = `
            <p>Hi ${sellerName || "Seller"},</p>
            <p>Thanks for signing the agreement. We've alerted the buyer to sign next.</p>
            <p>You can monitor progress <a href="${sellerViewLink}">on Water Traders</a>.</p>
          `;
          try {
            await sendEmail({ to: sellerEmail, subject: "Signature captured — awaiting buyer", html });
          } catch (err) {
            console.warn("[docsign webhook] seller confirmation failed", (err as any)?.message);
          }
        }

        return NextResponse.json({ ok: true, handled: "recipientCompletedSeller", envelopeId });
      }

      return NextResponse.json({ ok: true, handled: "recipientCompleted", envelopeId });
    }

    /* ================== envelope completed (fully executed) ================== */
    if (type.includes("completed")) {
      const { accessToken, accountId, restBase } = await getAccess();
      const base64Pdf = await fetchCombinedPdfBase64(accountId, restBase, accessToken, envelopeId);
      const offer = toOfferSummary(trade);

      // Seller
      if (trade.seller?.email) {
        const { html, preheader } = renderFullyExecutedEmail({
          recipientName: trade.seller?.name,
          counterpartName: trade.buyer?.name,
          offer,
          viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
        });
        await sendEmail({
          to: trade.seller.email,
          subject: "Fully executed agreement",
          html,
          preheader,
          attachments: [
            { filename: `WaterTraders_Agreement_${trade.id}.pdf`, content: base64Pdf, contentType: "application/pdf" },
          ],
          idempotencyKey: `ds:${envelopeId}:final-seller`,
        });
      }

      // Buyer
      if (trade.buyer?.email) {
        const { html, preheader } = renderFullyExecutedEmail({
          recipientName: trade.buyer?.name,
          counterpartName: trade.seller?.name,
          offer,
          viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
        });
        await sendEmail({
          to: trade.buyer.email,
          subject: "Fully executed agreement",
          html,
          preheader,
          attachments: [
            { filename: `WaterTraders_Agreement_${trade.id}.pdf`, content: base64Pdf, contentType: "application/pdf" },
          ],
          idempotencyKey: `ds:${envelopeId}:final-buyer`,
        });
      }

      return NextResponse.json({ ok: true, handled: "envelopeCompleted", envelopeId });
    }

    // ignore other events (delivered/sent/etc.)
    return NextResponse.json({ ok: true, ignored: readEventType(payload) || "unknown", envelopeId });
  } catch (e: any) {
    console.error("[docsign webhook] error:", e);
    // Return 200 so Connect doesn't retry forever; logs carry the details
    return NextResponse.json({ ok: true, ignored: "error" });
  }
}

// DocuSign availability checks
export async function GET() {
  return NextResponse.json({ ok: true });
}
