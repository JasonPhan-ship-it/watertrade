export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        listing: { select: { id: true, title: true, district: true, waterType: true, kind: true } },
        seller: { select: { id: true, email: true, name: true } },
        buyer:  { select: { id: true, email: true, name: true } },
        signatures: true,
      },
    });
    return NextResponse.json({ ok: true, tx });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message, code: e?.code, stack: e?.stack },
      { status: 500 }
    );
  }
}
