// lib/esign/dropbox.ts
import { prisma } from "@/lib/prisma";

const API_BASE = "https://api.hellosign.com/v3";

function authHeader() {
  const key = process.env.DROPBOX_SIGN_API_KEY || "";
  const token = Buffer.from(`${key}:`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

function isTestMode() {
  // default to test unless explicitly disabled
  return String(process.env.DROPBOX_SIGN_TEST_MODE ?? "true") === "true";
}

// Minimal helper to POST JSON to Dropbox Sign
async function hsPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dropbox Sign ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Create and send a Signature Request using a Template.
 * - Assumes your template has roles "Buyer" and "Seller"
 * - Auto-fills custom fields from Trade
 * - Lets Dropbox send signing emails to both parties
 */
export async function sendTradeForSignatureUsingTemplate(tradeId: string, args: {
  templateId: string; // your Dropbox Sign template id
}) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error("Trade not found");

  const [buyer, seller] = await Promise.all([
    prisma.user.findUnique({ where: { id: trade.buyerUserId || "" } }),
    prisma.user.findUnique({ where: { id: trade.sellerUserId || "" } }),
  ]);
  if (!buyer?.email || !seller?.email) {
    throw new Error("Buyer/Seller must have emails on file");
  }

  const priceLabel = `$${(trade.pricePerAf / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}/AF`;

  const body = {
    template_ids: [args.templateId],
    subject: "Water Transfer Agreement",
    message: "Please review and sign the agreement.",
    test_mode: isTestMode(),
    // If you created an API App and want app-level callbacks/branding
    client_id: process.env.DROPBOX_SIGN_CLIENT_ID || undefined,
    signers: [
      { role: "Buyer",  name: buyer.name || "Buyer",  email_address: buyer.email },
      { role: "Seller", name: seller.name || "Seller", email_address: seller.email },
    ],
    // These names must match your template's custom field names
    custom_fields: [
      { name: "listing_title", value: trade.windowLabel || "Offer Terms" },
      { name: "district",      value: trade.district || "" },
      { name: "water_type",    value: trade.waterType || "" },
      { name: "volume_af",     value: String(trade.volumeAf ?? "") },
      { name: "price_per_af",  value: priceLabel },
      { name: "window_label",  value: trade.windowLabel || "" },
    ],
    // Attach metadata so your webhook can locate the Trade later
    metadata: {
      tradeId: trade.id,
    },
  };

  type SendResp = {
    signature_request: {
      signature_request_id: string;
      signatures: Array<{
        signature_id: string;
        signer_role: string;
        signer_email_address: string;
        status_code: string;
      }>;
    };
  };

  const resp = await hsPostJson<SendResp>("/signature_request/send_with_template", body);

  return {
    requestId: resp.signature_request.signature_request_id,
    signatures: resp.signature_request.signatures,
  };
}
