// app/api/trades/lookup/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, match: null, error: "missing id" }, { status: 400 });

  try {
    const row = await prisma.transaction.findUnique({
      where: { id },
      include: {
        listing: { select: { id: true, title: true, district: true, waterType: true, kind: true } },
        seller: { select: { id: true, email: true, name: true } },
        buyer: { select: { id: true, email: true, name: true } },
        signatures: true,
      },
    });
    if (!row) return NextResponse.json({ ok: false, match: null }, { status: 404 });
    return NextResponse.json({ ok: true, match: row, trade: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, match: null, error: e?.message || "lookup failed" }, { status: 500 });
  }
}
