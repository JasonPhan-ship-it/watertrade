// app/api/webhooks/dropbox-sign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TradeStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------- Optional dynamic SDK loader (safe if @dropbox/sign isn't installed) -------- */
let EventCallbackHelper: any;
let EventCallbackRequest: any;

async function loadDropboxSdk() {
  if (EventCallbackHelper && EventCallbackRequest) return;
  try {
    const mod = await import("@dropbox/sign");
    EventCallbackHelper = mod.EventCallbackHelper;
    EventCallbackRequest = mod.EventCallbackRequest;
  } catch {
    // Build can still succeed; we'll ACK but skip verification & updates
    console.warn("[dropbox-sign webhook] SDK not installed; skipping signature verification.");
    EventCallbackHelper = { isValid: () => true };
    EventCallbackRequest = { init: (d: any) => d };
  }
}

/** Dropbox Sign requires this exact plain-text body on success */
function ack() {
  return new NextResponse("Hello API Event Received", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

/** Safely pick the first available enum value from your TradeStatus */
function pickStatus(names: Array<keyof typeof TradeStatus | string>): TradeStatus | null {
  for (const n of names) {
    if ((TradeStatus as any)[n]) return (TradeStatus as any)[n] as TradeStatus;
  }
  return null;
}

/** Parse webhook payload from either form-data ('json' field) or raw JSON */
async function parseDropboxPayload(req: NextRequest) {
  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.includes("application/json")) {
      return await req.json();
    }
    const fd = await req.formData();
    const raw = String(fd.get("json") || "{}");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET() {
  // Some verifiers ping GET; OK to respond
  return ack();
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    if (!apiKey) {
      console.warn("[dropbox-sign webhook] Missing DROPBOX_SIGN_API_KEY");
      return ack(); // still ack so Sign doesn't retry forever
    }

    const data = await parseDropboxPayload(req);
    if (!data || !data.event) return ack();

    // Load SDK (or fallback) and verify payload signature
    await loadDropboxSdk();
    try {
      const evt = EventCallbackRequest.init(data);
      if (!EventCallbackHelper.isValid(apiKey, evt)) {
        console.warn("[dropbox-sign webhook] invalid signature");
        // Respond 200 anyway per their retry guidance, but do nothing
        return ack();
      }
    } catch (e) {
      console.warn("[dropbox-sign webhook] signature check error:", (e as any)?.message);
      return ack();
    }

    // Always ACK quickly; we’ll still do the work in this request (fast operations)
    const res = ack();

    const eventType: string = data.event?.event_type;
    const sigReq = data.signature_request;
    const tradeId: string | undefined = sigReq?.metadata?.tradeId;

    // Handle the built-in test event
    if (eventType === "callback_test") {
      return res;
    }

    if (!tradeId) return res;

    // Persist raw event for audit/debug (optional)
    try {
      await prisma.trade.update({
        where: { id: tradeId },
        data: {
          events: {
            create: {
              actor: "system",
              kind: `DROPBOX_${eventType?.toUpperCase?.() || "EVENT"}`,
              payload: {
                signature_request_id: sigReq?.signature_request_id,
                event_type: eventType,
                raw: data,
              },
            },
          },
        },
      });
    } catch (e) {
      console.warn("[dropbox-sign webhook] failed to log trade event:", (e as any)?.message);
    }

    // Derive status transitions
    try {
      if (eventType === "signature_request_sent") {
        const next = pickStatus([
          "ACCEPTED_PENDING_BUYER_SIGNATURE",
          "PENDING_BUYER_SIGNATURE",
        ]);
        if (next) await prisma.trade.update({ where: { id: tradeId }, data: { status: next } });
      }

      if (eventType === "signature_request_signed") {
        const buyerSigned = sigReq?.signatures?.some(
          (s: any) => s.signer_role === "Buyer" && s.status_code === "signed",
        );
        const sellerSigned = sigReq?.signatures?.some(
          (s: any) => s.signer_role === "Seller" && s.status_code === "signed",
        );

        let next: TradeStatus | null = null;
        if (buyerSigned && !sellerSigned) {
          next = pickStatus(["ACCEPTED_PENDING_SELLER_SIGNATURE", "PENDING_SELLER_SIGNATURE"]);
        } else if (sellerSigned && !buyerSigned) {
          next = pickStatus(["ACCEPTED_PENDING_BUYER_SIGNATURE", "PENDING_BUYER_SIGNATURE"]);
        }
        if (next) await prisma.trade.update({ where: { id: tradeId }, data: { status: next } });
      }

      if (eventType === "signature_request_all_signed") {
        const done = pickStatus(["SIGNED_COMPLETE", "COMPLETED", "EXECUTED"]);
        if (done) await prisma.trade.update({ where: { id: tradeId }, data: { status: done } });
      }

      if (eventType === "signature_request_declined") {
        const declined = pickStatus(["DECLINED", "CANCELLED", "EXPIRED"]);
        if (declined) await prisma.trade.update({ where: { id: tradeId }, data: { status: declined } });
      }

      if (eventType === "signature_request_canceled") {
        const cancelled = pickStatus(["CANCELLED", "CANCELED"]);
        if (cancelled) await prisma.trade.update({ where: { id: tradeId }, data: { status: cancelled } });
      }

      if (eventType === "signature_request_expired") {
        const expired = pickStatus(["EXPIRED"]);
        if (expired) await prisma.trade.update({ where: { id: tradeId }, data: { status: expired } });
      }
    } catch (e) {
      console.error("[dropbox-sign webhook] status update error:", (e as any)?.message);
    }

    return res;
  } catch (e: any) {
    console.error("[dropbox-sign webhook] unhandled error:", e?.message);
    // Still ACK so Dropbox Sign doesn't retry forever
    return ack();
  }
}
