// app/api/signing/buyer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureTradeFromAnyIdOrCreate, createBuyerSignatureLink } from "@/lib/trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeRedirect(raw?: string | null) {
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return url.pathname + (url.search || "");
    } catch {
      return undefined;
    }
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export async function GET(req: NextRequest) {
  try {
    const txId = req.nextUrl.searchParams.get("tx");
    if (!txId) {
      return NextResponse.json({ error: "Missing tx" }, { status: 400 });
    }

    const redirectPath = sanitizeRedirect(req.nextUrl.searchParams.get("redirect"));

    const trade = await ensureTradeFromAnyIdOrCreate(txId);
    if (!trade) {
      return NextResponse.json({ error: "Transaction or trade not found" }, { status: 404 });
    }

    const buyerToken = (trade as any)?.buyerToken ?? null;
    const signUrl = await createBuyerSignatureLink(trade.id, buyerToken, {
      redirectTo: redirectPath,
    });

    return NextResponse.redirect(signUrl, 302);
  } catch (err: any) {
    console.error("[api/signing/buyer] error:", err);
    return NextResponse.json(
      { error: "Failed to create buyer signing URL", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
