// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer } from "@/lib/trade";

// If you have a shared helper, you can import it instead of duplicating:
async function findTradeByAnyId(id: string) {
  const byTrade = await prisma.trade.findUnique({ where: { id } });
  if (byTrade) return byTrade;
  return prisma.trade.findFirst({ where: { transactionId: id } });
}

// Quick sanity check: verify the route is wired
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    route: "trades/:id/seller/accept",
    id: params.id,
    role: url.searchParams.get("role") ?? null,
    tokenPresent: url.searchParams.has("token"),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const trade = await findTradeByAnyId(rawId);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", hint: "No Trade with this id or transactionId" },
        { status: 404 }
      );
    }

    // ---- Authorization (must be seller) ----
    const viewer = await getViewer(req as any, trade as any);
    // If your getViewer can return a "forbidden" with reason, use it; otherwise show role we saw.
    // @ts-ignore - in case getViewer doesn't include "reason"
    const reason: string | undefined = viewer?.reason;

    if (!viewer || viewer.role !== "seller") {
      const url = new URL(req.url);
      return NextResponse.json(
        {
          error: "Forbidden",
          // Provide actionable hints so you can see *why* in the UI:
          details: reason ?? `viewer-role-is-${viewer?.role ?? "unknown"}`,
          sawRoleQueryParam: url.searchParams.get("role") ?? null,
          tokenPresent: url.searchParams.has("token"),
          tip:
            "Ensure you are signed in as the seller of this trade, or provide a valid ?token=...&role=seller magic link if using email access.",
        },
        { status: 403 }
      );
    }

    // ---- Update Trade (seller accepted) ----
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
    });

    // ---- Keep Transaction in sync (best-effort, wrapped) ----
    if (updated.transactionId) {
      try {
        await prisma.transaction.update({
          where: { id: updated.transactionId },
          data: { status: TransactionStatus.PENDING_BUYER_SIGNATURE },
        });
      } catch (e) {
        // If your TransactionStatus doesn't include PENDING_BUYER_SIGNATURE,
        // change it to a valid status or remove this block.
        console.warn("[seller/accept] transaction sync skipped:", (e as any)?.message);
      }
    }

    // ---- (Optional) Email buyer - left commented so accept flow isn't blocked ----
    // try {
    //   // ...lookup buyer, build email, send...
    // } catch (e) {
    //   console.warn("[seller/accept] email failed:", (e as any)?.message);
    // }

    // ---- Redirect back to the trade view ----
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    // preserve role/token from incoming request if present (useful for magic-link flows)
    const inUrl = new URL(req.url);
    const role = inUrl.searchParams.get("role") || "seller";
    const token = inUrl.searchParams.get("token");

    const out = new URL(`/t/${updated.id}`, base);
    out.searchParams.set("role", role);
    out.searchParams.set("action", "review");
    if (token) out.searchParams.set("token", token);

    return NextResponse.redirect(out);
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
