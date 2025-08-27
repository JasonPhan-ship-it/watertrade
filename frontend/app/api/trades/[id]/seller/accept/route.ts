// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer, findTradeByAnyId } from "@/lib/trade";

/** Pick a "pending buyer signature" transaction status that exists in your enum */
function pickTxnPendingBuyerSig():
  (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return (
    TXS.PENDING_BUYER_SIGNATURE ??
    TXS.PENDING_SIGNATURE ??
    TXS.PENDING ??
    TXS.ACCEPTED ??
    null
  );
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Optional: lightweight route check
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    route: "trades/:id/seller/accept",
    id: params.id,
    sawRoleParam: url.searchParams.get("role") ?? null,
    tokenPresent: url.searchParams.has("token"),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Accept Trade.id or Transaction.id
    const trade = await findTradeByAnyId(rawId);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", hint: "No Trade with this id or transactionId" },
        { status: 404 }
      );
    }

    // AuthZ: must be seller
    const viewer = await getViewer(req as any, trade as any);
    if (!viewer || viewer.role !== "seller") {
      const url = new URL(req.url);
      return NextResponse.json(
        {
          error: "Forbidden",
          details: {
            viewerRole: viewer?.role ?? "unknown",
            via: (viewer as any)?.via ?? "n/a",
            hasToken: url.searchParams.has("token") || !!req.headers.get("x-trade-token"),
            sawRoleParam: url.searchParams.get("role") ?? null,
          },
          tip: "Sign in as the seller or include ?role=seller&token=<sellerToken>.",
        },
        { status: 403 }
      );
    }

    // Update Trade
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.ACCEPTED_PENDING_BUYER_SIGNATURE,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            id: crypto.randomUUID(),
            actor: "seller",
            kind: "ACCEPT",
            payload: {
              previousStatus: trade.status,
              round: trade.round,
            },
          },
        },
      },
      select: { id: true, status: true, transactionId: true },
    });

    // Best-effort Transaction sync
    if (updated.transactionId) {
      try {
        const pending = pickTxnPendingBuyerSig();
        if (pending) {
          await prisma.transaction.update({
            where: { id: updated.transactionId },
            data: { status: pending },
          });
        }
      } catch (e) {
        console.warn("[seller/accept] transaction sync skipped:", (e as any)?.message);
      }
    }

    // Build a URL the client can navigate to
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inUrl = new URL(req.url);
    const token = inUrl.searchParams.get("token") || undefined;
    const role = inUrl.searchParams.get("role") || "seller";

    const out = new URL(`/t/${updated.id}`, base);
    out.searchParams.set("role", role);
    out.searchParams.set("action", "review");
    if (token) out.searchParams.set("token", token);

    // If explicitly requested (e.g., email link uses ?redirect=1), send 303 redirect
    const wantsRedirect = inUrl.searchParams.get("redirect") === "1";
    if (wantsRedirect) {
      // 303 converts POST to GET so the app page loads correctly
      return NextResponse.redirect(out, 303);
    }

    // Default: return JSON so client code can navigate
    return NextResponse.json({
      ok: true,
      tradeId: updated.id,
      status: updated.status,
      redirectUrl: out.toString(),
    });
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
