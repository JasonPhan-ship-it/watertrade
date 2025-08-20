export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  const token = searchParams.get("token") || "";

  const out: any = { id, token, match: null };

  try {
    if (id) {
      const t = await prisma.trade.findUnique({ where: { id }, include: { listing: true } });
      if (t) { out.match = "tradeById"; out.record = { id: t.id, listingId: t.listingId ?? null }; return NextResponse.json(out); }
      const tx = await prisma.transaction.findUnique({ where: { id }, include: { listing: true } } as any);
      if (tx) { out.match = "txById"; out.record = { id: tx.id, listingId: (tx as any).listingId ?? null }; return NextResponse.json(out); }
    }

    if (token) {
      const tTok = await prisma.trade.findFirst({
        where: { OR: [{ sellerToken: token }, { buyerToken: token }] },
        include: { listing: true },
      } as any);
      if (tTok) { out.match = "tradeByToken"; out.record = { id: tTok.id, listingId: tTok.listingId ?? null }; return NextResponse.json(out); }

      const txTok = await prisma.transaction.findFirst({
        where: { OR: [{ sellerToken: token }, { buyerToken: token }] },
        include: { listing: true },
      } as any);
      if (txTok) { out.match = "txByToken"; out.record = { id: (txTok as any).id, listingId: (txTok as any).listingId ?? null }; return NextResponse.json(out); }
    }

  } catch (e: any) {
    out.error = e?.message || "lookup failed";
    return NextResponse.json(out, { status: 500 });
  }

  return NextResponse.json(out, { status: 404 });
}
