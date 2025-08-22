import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TransactionStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tx = await prisma.transaction.findUnique({
      where: { id: params.id },
      select: { id: true, sellerId: true },
    });
    if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const me = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } });
    if (!me || me.id !== tx.sellerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.transaction.update({
      where: { id: params.id },
      data: { status: TransactionStatus.CANCELLED }, // or DECLINED, if you have it
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[seller/decline]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
