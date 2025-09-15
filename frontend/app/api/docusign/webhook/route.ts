// app/api/docusign/webhook/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";

/* ---------- helpers ---------- */
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

const renderSimpleHtml = (title: string, text: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;font-size:14px;line-height:1.6;">
        <tr><td style="padding:20px 24px;">
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${esc(title)}</div>
          <div style="white-space:pre-line;">${esc(text)}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>`;

/* ---------- minimal XML extraction ---------- */
async function parseXml(xml: string) {
  const grab = (re: RegExp) => (xml.match(re)?.[1] ?? "").trim();

  const envelopeId = grab(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i);
  const status = grab(/<Status>([^<]+)<\/Status>/i);

  const recips: Array<{ email: string; name: string; status: string; type?: string }> = [];
  const recipBlocks = xml.match(/<RecipientStatus\b[^>]*>[\s\S]*?<\/RecipientStatus>/gi) || [];
  for (const block of recipBlocks) {
    const email = (block.match(/<Email>([^<]+)<\/Email>/i)?.[1] ?? "").trim();
    const name = (block.match(/<UserName>([^<]+)<\/UserName>/i)?.[1] ?? "").trim();
    const rstat = (block.match(/<Status>([^<]+)<\/Status>/i)?.[1] ?? "").trim();
    const rtype = (block.match(/<Type>([^<]+)<\/Type>/i)?.[1] ?? "").trim();
    if (email) recips.push({ email, name, status: rstat, type: rtype });
  }

  const customFields: Record<string, string> = {};
  const cfBlocks = xml.match(/<TextCustomField>[\s\S]*?<\/TextCustomField>/gi) || [];
  for (const cf of cfBlocks) {
    const name = (cf.match(/<Name>([^<]+)<\/Name>/i)?.[1] ?? "").trim();
    const value = (cf.match(/<Value>([^<]+)<\/Value>/i)?.[1] ?? "").trim();
    if (name) customFields[name] = value;
  }

  return { envelopeId, status, recips, customFields };
}

/* ---------- routes ---------- */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text(); // keep raw for HMAC
    const headerSig = req.headers.get("x-docusign-signature-1") || "";
    const key = process.env.DOCUSIGN_CONNECT_HMAC_KEY || "";

    if (key) {
      const computed = crypto.createHmac("sha256", key).update(raw, "utf8").digest("base64");
      if (!headerSig || !safeEqual(computed, headerSig)) {
        return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
      }
    }

    const { envelopeId, status, recips, customFields } = await parseXml(raw);

    // Send to recipients who just completed
    const completedNow = recips.filter((r) => r.status?.toLowerCase() === "completed");

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

    for (const r of completedNow) {
      if (!r.email) continue;
      const text = body(r.name);
      await sendEmail({
        to: r.email,
        subject,
        text,
        html: renderSimpleHtml(subject, text),
        preheader: "Your document has been completed on DocuSign.",
      });
    }

    // When the envelope as a whole is Completed, email everyone once
    if ((status || "").toLowerCase() === "completed") {
      const everyone = Array.from(new Set(recips.map((r) => r.email).filter(Boolean)));
      for (const email of everyone) {
        const text = body("");
        await sendEmail({
          to: email!,
          subject,
          text,
          html: renderSimpleHtml(subject, text),
          preheader: "Your document has been completed on DocuSign.",
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[docusign/webhook] error", e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
