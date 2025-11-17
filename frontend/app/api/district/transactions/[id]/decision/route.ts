import { NextRequest, NextResponse } from "next/server";
import { TransactionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireDistrictAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireDistrictAdmin();
    const id = (params.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });
    }

    let decisionRaw: string | undefined;
    try {
      const body = await req.json();
      decisionRaw = typeof body?.decision === "string" ? body.decision : undefined;
    } catch (err) {
      // noop – handled below
    }

    const decision = (decisionRaw || "").toLowerCase();
    if (decision !== "accept" && decision !== "decline") {
      return NextResponse.json({ error: "Decision must be 'accept' or 'decline'" }, { status: 400 });
    }

    const tx = await prisma.transaction.findUnique({ where: { id }, select: { status: true } });
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (
      tx.status === TransactionStatus.APPROVED ||
      tx.status === TransactionStatus.FUNDS_RELEASED
    ) {
      return NextResponse.json({ error: "This transaction is already approved" }, { status: 409 });
    }

    if (tx.status === TransactionStatus.CANCELLED) {
      return NextResponse.json({ error: "This transaction has been cancelled" }, { status: 409 });
    }

    const nextStatus = decision === "accept" ? TransactionStatus.APPROVED : TransactionStatus.CANCELLED;

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(decision === "accept"
          ? { complianceApprovedBy: actor.id, complianceApprovedAt: new Date() }
          : {}),
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({ ok: true, status: updated.status, decision }, { status: 200 });
  } catch (err: any) {
    if (err?.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[district decision] unexpected", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
