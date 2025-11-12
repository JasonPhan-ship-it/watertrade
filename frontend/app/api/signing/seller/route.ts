// app/api/signing/seller/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureTradeFromAnyIdOrCreate, createSellerSignatureLink } from "@/lib/trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const txId = req.nextUrl.searchParams.get("tx");
    if (!txId) {
      return NextResponse.json({ error: "Missing tx" }, { status: 400 });
    }

    const trade = await ensureTradeFromAnyIdOrCreate(txId);
    if (!trade) {
      return NextResponse.json({ error: "Transaction or trade not found" }, { status: 404 });
    }

    const sellerToken = (trade as any)?.sellerToken ?? null;
    const signUrl = await createSellerSignatureLink(trade.id, sellerToken);

    return NextResponse.redirect(signUrl, 302);
  } catch (err: any) {
    console.error("[api/signing/seller] error:", err);
    return NextResponse.json(
      { error: "Failed to create seller signing URL", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
