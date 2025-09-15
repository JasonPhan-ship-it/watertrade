// app/api/docusign/webhook/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendEmail } from "@/lib/email"; // add this helper (see below)

// Helper: timing-safe equality
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function parseXml(xml: string) {
  // lightweight XML -> JSON without extra deps
  // This is minimal: we pull fields we care about using simple regex + slices.
  // If you prefer a full parser, install "xml2js" and use it instead.
  const grab = (re: RegExp) => (xml.match(re)?.[1] ?? "").trim();

  // Envelope-level
  const envelopeId = grab(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i);
  const status     = grab(/<Status>([^<]+)<\/Status>/i);

  // Recipient blocks – grab multiple
  const recips: Array<{ email: string; name: string; status: string; type?: string }> = [];
  const recipBlocks = xml.match(/<RecipientStatus\b[^>]*>[\s\S]*?<\/RecipientStatus>/gi) || [];
  for (const block of recipBlocks) {
    const email  = (block.match(/<Email>([^<]+)<\/Email>/i)?.[1] ?? "").trim();
    const name   = (block.match(/<UserName>([^<]+)<\/UserName>/i)?.[1] ?? "").trim();
    const rstat  = (block.match(/<Status>([^<]+)<\/Status>/i)?.[1] ?? "").trim();
    const rtype  = (block.match(/<Type>([^<]+)<\/Type>/i)?.[1] ?? "").trim();
    if (email) recips.push({ email, name, status: rstat, type: rtype });
  }

  // Custom Fields (envelope text fields), if present
  const customFields: Record<string, string> = {};
  const cfBlocks = xml.match(/<TextCustomField>[\s\S]*?<\/TextCustomField>/gi) || [];
  for (const cf of cfBlocks) {
    const name  = (cf.match(/<Name>([^<]+)<\/Name>/i)?.[1] ?? "").trim();
    const value = (cf.match(/<Value>([^<]+)<\/Value>/i)?.[1] ?? "").trim();
    if (name) customFields[name] = value;
  }

  return { envelopeId, status, recips, customFields };
}

export async function GET() {
  // Simple liveness probe
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text(); // raw body for HMAC
    const headerSig = req.headers.get("x-docusign-signature-1") || "";
    const key = process.env.DOCUSIGN_CONNECT_HMAC_KEY || "";

    if (key) {
      const computed = crypto.createHmac("sha256", key).update(raw, "utf8").digest("base64");
      if (!headerSig || !safeEqual(computed, headerSig)) {
        return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
      }
    }

    const { envelopeId, status, recips, customFields } = await parseXml(raw);

    // We’ll send emails for each signer who just reached Completed
    // DocuSign may post multiple times; idempotency is okay (receivers can get >1 email in edge cases).
    const completedNow = recips.filter(r => r.status?.toLowerCase() === "completed");

    // Subject/body
    const subject = "Water Traders: Document signed";
    const tradeIdLabel = customFields["trade_id"] ? ` for Trade ${customFields["trade_id"]}` : "";
    const body = (who: string) =>
`Hi ${who || "there"},

You’ve successfully signed your Water Traders agreement${tradeIdLabel}.
Envelope ID: ${envelopeId}
Status: ${status}

You can view your activity in your dashboard:
https://www.watertraders.com/dashboard

— Water Traders`;

    // fire emails
    for (const r of completedNow) {
      if (!r.email) continue;
      await sendEmail({
        to: r.email,
        subject,
        text: body(r.name),
      });
    }

    // Optional: when the envelope as a whole reaches Completed, email everyone in the envelope
    if ((status || "").toLowerCase() === "completed") {
      const everyone = Array.from(new Set(recips.map(r => r.email).filter(Boolean)));
      for (const email of everyone) {
        await sendEmail({ to: email!, subject, text: body("") });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[docusign/webhook] error", e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
