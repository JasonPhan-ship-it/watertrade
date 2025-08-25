// frontend/app/api/trades/[id]/seller/decline/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TransactionStatus } from "@prisma/client";

/** Reject accidental GET navigations (e.g., clicking a link to this API) */
export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

/** Optional: respond to HEAD the same way */
export async function HEAD() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    // ---- Auth ----
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ---- Load transaction by ID (ensure your front-end passes the *transaction* id here) ----
    const tx = await prisma.transaction.findUnique({
      where: { id: params.id },
      select: { id: true, sellerId: true, status: true },
    });

    if (!tx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ---- Verify current user is the seller on this transaction ----
    const me = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });

    if (!me || me.id !== tx.sellerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ---- Transition to DECLINED (fallback to CANCELLED if DECLINED enum doesn't exist) ----
    const DECLINED =
      (TransactionStatus as any)?.DECLINED || TransactionStatus.CANCELLED;

    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: DECLINED },
      select: { id: true, status: true, sellerId: true },
    });

    return NextResponse.json(
      { ok: true, id: updated.id, status: updated.status },
      { status: 200 }
    );
  } catch (e) {
    console.error("[api/trades/:id/seller/decline] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
