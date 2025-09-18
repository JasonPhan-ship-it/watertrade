// app/api/webhooks/docusign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";
import {
  renderSellerNeedsSignatureEmail,
  renderBuyerSignedAckEmail,
  renderFullyExecutedEmail,
} from "@/lib/email"; // these must exist (see section 1)

let docusign: any = null;

// -------- minimal DS auth helpers (copy from your sign-url or factor to a shared module) --------
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
    const asUtf8 = Buffer.from(b64, "base64").toString("utf8");
    if (asUtf8.includes("PRIVATE KEY")) return asUtf8;
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

  // resolve account + rest base
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

// -------- optional HMAC verification for Connect --------
async function verifyHmac(req: NextRequest) {
  const secret = (process.env.DOCUSIGN_CONNECT_HMAC_SECRET || "").trim();
  if (!secret) return true; // skip verification if not configured
  const sig = req.headers.get("x-docusign-signature-1");
  if (!sig) return false;
  const body = Buffer.from(await req.arrayBuffer());
  const key = Buffer.from(secret, "base64"); // DocuSign UI provides base64 key
  const crypto = await import("crypto");
  const h = crypto.createHmac("sha256", key).update(body).digest("base64");
  return h === sig;
}

// -------- helpers --------
function eventType(payload: any): string {
  // Support various JSON shapes
  return (
    payload?.event?.eventType ||
    payload?.eventType ||
    payload?.envelopeStatus?.status ||
    ""
  ).toString().toLowerCase();
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
  // Try common locations for recipient event info
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

// Fetch the combined, fully executed PDF
async function fetchCombinedPdf(accountId: string, restBase: string, accessToken: string, envelopeId: string) {
  await loadDS();
  const api = new docusign.ApiClient();
  api.setBasePath(restBase);
  api.addDefaultHeader("Authorization", "Bearer " + accessToken);
  const envelopesApi = new docusign.EnvelopesApi(api);
  const file: any = await envelopesApi.getDocument(accountId, envelopeId, "combined", null);
  const buf: Buffer = Buffer.isBuffer(file) ? file : Buffer.from(file, "binary");
  return buf.toString("base64");
}

// Build the offer summary for emails
function toOfferSummary(trade: any) {
  return {
    listingTitle: trade.listingTitle || trade.windowLabel || `Trade ${trade.id}`,
    district: trade.district || "—",
    waterType: trade.waterType || null,
    volumeAf: trade.volumeAf || 0,
    pricePerAf: trade.pricePerAf || 0,
    priceLabel: undefined,
    windowLabel: trade.windowLabel || undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Verify HMAC (if configured)
    const ok = await verifyHmac(req);
    if (!ok) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

    // Parse JSON (DocuSign Connect can also send XML; configure JSON in Connect/EventNotification)
    const payload = await req.json().catch(() => ({}));

    const type = eventType(payload); // e.g., 'recipientcompleted', 'completed'
    const envelopeId = extractEnvelopeId(payload);
    if (!envelopeId) {
      return NextResponse.json({ ok: true, ignored: "no envelopeId" });
    }

    // Your correlation: we store tradeId in custom fields or metadata
    // If you added custom tabs called 'trade_id' etc., Connect can echo them.
    const tradeId =
      payload?.customFields?.textCustomFields?.find((f: any) => f?.name === "trade_id")?.value ||
      payload?.data?.customFields?.find?.((f: any) => f?.name === "trade_id")?.value ||
      payload?.tradeId || // fallback if using Connect "Include sender account as custom field" + custom settings
      null;

    let trade: any = null;
    if (tradeId) {
      trade = await prisma.trade.findUnique({
        where: { id: tradeId },
        include: { listing: { select: { title: true } }, buyerUser: true, sellerUser: true },
      });
    }

    // Handle recipient-completed (buyer finished -> notify seller; buyer ack)
    if (type.includes("recipient") && type.includes("completed")) {
      const r = extractRecipient(payload);
      // If we can deduce that the BUYER finished, email the SELLER to sign next
      if (trade) {
        const offer = toOfferSummary({
          id: trade.id,
          listingTitle: trade.listing?.title,
          windowLabel: trade.windowLabel,
          district: trade.district,
          waterType: trade.waterType,
          volumeAf: trade.volumeAf,
          pricePerAf: trade.pricePerAf,
        });

        // Heuristic: if recipient role contains 'buyer', we notify seller; and vice-versa we could ack buyer
        const role = (r?.role || "").toLowerCase();
        if (role.includes("buyer") && trade.sellerUser?.email) {
          const signLink = appUrl(`/sign/${trade.id}?role=seller`);
          const { html, preheader } = renderSellerNeedsSignatureEmail({
            sellerName: trade.sellerUser?.name,
            buyerName: trade.buyerUser?.name,
            offer,
            signLink,
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.sellerUser.email,
            subject: "Please review & sign",
            html,
            preheader,
          });
        }

        if (role.includes("buyer") && trade.buyerUser?.email) {
          const { html, preheader } = renderBuyerSignedAckEmail({
            buyerName: trade.buyerUser?.name,
            sellerName: trade.sellerUser?.name,
            offer,
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.buyerUser.email,
            subject: "We’ve recorded your signature",
            html,
            preheader,
          });
        }
      }

      return NextResponse.json({ ok: true, handled: "recipientCompleted", envelopeId });
    }

    // Handle envelope completed (both parties signed)
    if (type.includes("completed")) {
      // Fetch final combined PDF and send to both parties
      const { accessToken, accountId, restBase } = await getAccess();
      const base64 = await fetchCombinedPdf(accountId, restBase, accessToken, envelopeId);

      if (trade) {
        const offer = toOfferSummary({
          id: trade.id,
          listingTitle: trade.listing?.title,
          windowLabel: trade.windowLabel,
          district: trade.district,
          waterType: trade.waterType,
          volumeAf: trade.volumeAf,
          pricePerAf: trade.pricePerAf,
        });

        const attach = [{
          filename: `WaterTraders_Agreement_${trade.id}.pdf`,
          content: base64,
          contentType: "application/pdf",
        }];

        // Seller
        if (trade.sellerUser?.email) {
          const { html, preheader } = renderFullyExecutedEmail({
            recipientName: trade.sellerUser?.name,
            counterpartName: trade.buyerUser?.name,
            offer,
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.sellerUser.email,
            subject: "Fully executed agreement",
            html,
            preheader,
            attachments: attach,
          });
        }

        // Buyer
        if (trade.buyerUser?.email) {
          const { html, preheader } = renderFullyExecutedEmail({
            recipientName: trade.buyerUser?.name,
            counterpartName: trade.sellerUser?.name,
            offer,
            viewLink: appUrl(`/transactions/${trade.transactionId || trade.id}`),
          });
          await sendEmail({
            to: trade.buyerUser.email,
            subject: "Fully executed agreement",
            html,
            preheader,
            attachments: attach,
          });
        }
      }

      return NextResponse.json({ ok: true, handled: "envelopeCompleted", envelopeId });
    }

    // Ignore other events
    return NextResponse.json({ ok: true, ignored: type || "unknown", envelopeId });
  } catch (e: any) {
    console.error("[docusign webhook] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "webhook error" }, { status: 500 });
  }
}

// DocuSign validates a 200 on HEAD for availability checks
export async function GET() {
  return NextResponse.json({ ok: true });
}
