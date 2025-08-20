export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 10)));

  try {
    const rows = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        listingId: true,
        sellerId: true,
        buyerId: true,
        type: true,
        acreFeet: true,
        pricePerAF: true,
      },
    } as any);

    return NextResponse.json({ count: rows.length, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "query failed" }, { status: 500 });
  }
}
