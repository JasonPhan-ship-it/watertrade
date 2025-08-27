// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer, findTradeByAnyId } from "@/lib/trade";

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
    if (!rawId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Support Trade.id or Transaction.id
    const trade = await findTradeByAnyId(rawId);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", hint: "No Trade with this id or transactionId" },
        { status: 404 }
      );
    }

    // ---- Authorization (must be seller) ----
    const viewer = await getViewer(req as any, trade as any);
    if (!viewer || viewer.role !== "seller") {
      const url = new URL(req.url);
      return NextResponse.json(
        {
          error: "Forbidden",
          details: `viewer-role-is-${viewer?.role ?? "unknown"}`,
          sawRoleQueryParam: url.searchParams.get("role") ?? null,
          tokenPresent: url.searchParams.has("token"),
          tip: "Sign in as the seller or use a valid ?token=...&role=seller magic link.",
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
            actor: "seller",
            kind: "ACCEPT",
            payload: { previousStatus: trade.status, round: trade.round },
          },
        },
      },
      select: { id: true, status: true, transactionId: true },
    });

    // ---- Keep Transaction in sync (best-effort) ----
    if (updated.transactionId) {
      try {
        const next =
          (TransactionStatus as any)?.PENDING_BUYER_SIGNATURE ??
          (TransactionStatus as any)?.PENDING_SIGNATURE ??
          null;
        if (next) {
          await prisma.transaction.update({
            where: { id: updated.transactionId },
            data: { status: next },
          });
        }
      } catch (e) {
        console.warn("[seller/accept] transaction sync skipped:", (e as any)?.message);
      }
    }

    // --- Content negotiation: JSON for fetch(), redirect for link/form navigations ---
    const wantsJson =
      req.headers.get("accept")?.includes("application/json") ||
      req.headers.get("x-fetch-intent") === "json" ||
      new URL(req.url).searchParams.get("format") === "json";

    if (wantsJson) {
      return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
    }

    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
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
