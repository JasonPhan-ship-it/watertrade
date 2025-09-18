// app/api/webhook/docsign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";
import {
  renderSellerNeedsSignatureEmail,
  renderBuyerSignedAckEmail,
  renderFullyExecutedEmail,
} from "@/lib/email";

let docusign: any = null;

/* ---------------- DocuSign auth + REST base ---------------- */
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

async function fetchCombinedPdf(
  accountId: string,
  restBase: string,
  accessToken: string,
  envelopeId: string
) {
  await loadDS();
  const api = new docusign.ApiClient();
  api.setBasePath(restBase);
  api.addDefaultHeader("Authorization", "Bearer " + accessToken);
  const envelopesApi = new docusign.EnvelopesApi(api);
  const file: any = await envelopesApi.getDocument(accountId, envelopeId, "combined", null);
  const buf: Buffer = Buffer.isBuffer(file) ? file : Buffer.from(file, "binary");
  return buf.toString("base64");
}

/* ---------------- Connect security (optional HMAC) ---------------- */
async function verifyHmac(req: NextRequest) {
  const secret = (process.env.DOCUSIGN_CONNECT_HMAC_SECRET || "").trim();
  if (!secret) return true; // skip if not configured
  const sig = req.headers.get("x-docusign-signature-1");
  if (!sig) return false;
  const body = Buffer.from(await req.arrayBuffer());
  const { createHmac } = await import("crypto");
  const key = Buffer.from(secret, "base64"); // DocuSign provides base64 key
  const h = createHmac("sha256", key).update(body).digest("base64");
  return h === sig;
}

/* ---------------- Payload helpers ---------------- */
function eventType(payload: any): string {
  return (
    payload?.event?.eventType ||
    payload?.eventType ||
    payload?.envelopeStatus?.status ||
    ""
  )
    .toString()
    .toLowerCase();
}

function extractEnvelopeId(payload: any): string | null {
  return (
    payload?.envelopeId ||
    payload?.envelopeSummary?.envelopeId ||
    payload?.data?.envelopeId ||
    payload?.envelopeStatus?.envelopeID ||
    null
  );
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

/* ---------------- Trade/offer formatting ---------------- */
function toOfferSummary(trade: any) {
  return {
    listingTitle: trade.listingTitle || (trade as any).windowLabel || `Trade ${trade.id}`,
    district: trade.district || "—",
    waterType: trade.waterType || null,
    volumeAf: trade.volumeAf || 0,
    pricePerAf: trade.pricePerAf || 0,
    priceLabel: undefined,
    windowLabel: (trade as any).windowLabel || undefined,
  };
}

/* ---------------- Route handlers ---------------- */
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyHmac(req))) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }

    // DocuSign Connect JSON (ensure your Connect/EventNotification sends JSON)
    const payload = await req.json().catch(() => ({}));
    const type = eventType(payload); // e.g., 'recipientcompleted', 'completed'
    const envelopeId = extractEnvelopeId(payload);
    if (!envelopeId) return NextResponse.json({ ok: true, ignored: "no envelopeId" });

    // Try to recover trade id from custom fields in the event
    const tradeId =
      payload?.customFields?.textCustomFields?.find((f: any) => f?.name === "trade_id")?.value ||
      payload?.data?.customFields?.find?.((f: any) => f?.name === "trade_id")?.value ||
      payload?.tradeId ||
      null;

    let trade:
      | (Awaited<ReturnType<typeof prisma.trade.findUnique>> & {
          buyer?: { email: string | null; name: string | null } | null;
          seller?: { email: string | null; name: string | null } | null;
          listing?: { title: string } | null;
        })
      | null = null;

    if (tradeId) {
      trade = await prisma.trade.findUnique({
        where: { id: tradeId },
        include: {
          listing: { select: { title: true } },
          buyer: { select: { email: true, name: true } },
          seller: { select: { email: true, name: true } },
        },
      });
    }

    /* ---- Recipient completed: nudge the other party, ack the signer ---- */
    if (type.includes("recipient") && type.includes("completed")) {
      const r = extractRecipient(payload);
      if (trade) {
        const offer = toOfferSummary({
          id: trade.id,
          listingTitle: trade.listing?.title,
          windowLabel: (trade as any).windowLabel,
          district: trade.district,
          waterType: trade.waterType,
          volumeAf: trade.volumeAf,
          pricePerAf: trade.pricePerAf,
        });

        const role = (r?.role || "").toLowerCase();

        // If buyer finished → email seller to sign
        if (role.includes("buyer") && trade.seller?.email) {
          const signLink = appUrl(`/sign/${trade.id}?role=seller`);
          const { html, preheader } = renderSellerNeedsSignatureEmail({
            sellerName: trade.seller?.name,
            buyerName: trade.buyer?.name,
            offer,
            signLink,
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.seller.email,
            subject: "Please review & sign",
            html,
            preheader,
          });
        }

        // Ack the buyer who just signed
        if (role.includes("buyer") && trade.buyer?.email) {
          const { html, preheader } = renderBuyerSignedAckEmail({
            buyerName: trade.buyer?.name,
            sellerName: trade.seller?.name,
            offer,
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.buyer.email,
            subject: "We’ve recorded your signature",
            html,
            preheader,
          });
        }
      }

      return NextResponse.json({ ok: true, handled: "recipientCompleted", envelopeId });
    }

    /* ---- Envelope completed: send fully executed PDF to both parties ---- */
    if (type.includes("completed")) {
      const { accessToken, accountId, restBase } = await getAccess();
      const base64Pdf = await fetchCombinedPdf(accountId, restBase, accessToken, envelopeId);

      if (trade) {
        const offer = toOfferSummary({
          id: trade.id,
          listingTitle: trade.listing?.title,
          windowLabel: (trade as any).windowLabel,
          district: trade.district,
          waterType: trade.waterType,
          volumeAf: trade.volumeAf,
          pricePerAf: trade.pricePerAf,
        });

        const attachments = [
          {
            filename: `WaterTraders_Agreement_${trade.id}.pdf`,
            content: base64Pdf,
            contentType: "application/pdf",
          },
        ];

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
            attachments,
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
            attachments,
          });
        }
      }

      return NextResponse.json({ ok: true, handled: "envelopeCompleted", envelopeId });
    }

    // ignore other events
    return NextResponse.json({ ok: true, ignored: type || "unknown", envelopeId });
  } catch (e: any) {
    console.error("[docsign webhook] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "webhook error" }, { status: 500 });
  }
}

// DocuSign validates a 200 on HEAD/GET for availability checks
export async function GET() {
  return NextResponse.json({ ok: true });
}
