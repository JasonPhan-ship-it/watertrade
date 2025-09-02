// app/api/trades/[id]/seller/counter/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { sendEmail, appUrl } from "@/lib/email";
import { renderBuyerCounterEmail } from "@/lib/email";

/** Read either JSON or form-data and normalize fields */
async function readBody(req: NextRequest) {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as any;
    return {
      pricePerAf: json.pricePerAf ?? json.pricePerAF ?? json.price_per_af,
      volumeAf: json.volumeAf ?? json.acreFeet ?? json.quantity,
      windowLabel: json.windowLabel ?? json.window_label ?? null,
    };
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return {};
  return {
    pricePerAf: fd.get("pricePerAf") ?? fd.get("pricePerAF") ?? fd.get("price_per_af"),
    volumeAf: fd.get("volumeAf") ?? fd.get("acreFeet") ?? fd.get("quantity"),
    windowLabel: fd.get("windowLabel") ?? fd.get("window_label"),
  };
}

/** Ensure a Trade exists given either a Trade.id or a Transaction.id */
async function ensureTradeFromAnyId(id: string) {
  // Try existing trade or first trade for transaction
  const existing = await findTradeByAnyId(id);
  if (existing) return existing;

  // If not found, see if the id is a Transaction.id and create a Trade
  const txn = await prisma.transaction.findUnique({ where: { id } });
  if (!txn) return null;

  // Create a basic trade from transaction fields (populate what your schema supports)
  // Adjust these field names to your schema if different.
  const created = await prisma.trade.create({
    data: {
      transactionId: txn.id,
      sellerUserId: (txn as any).sellerUserId ?? null,
      buyerUserId: (txn as any).buyerUserId ?? null,
      // Seed with any initial terms if available on Transaction
      pricePerAf: (txn as any).pricePerAf ?? null,
      volumeAf: (txn as any).volumeAf ?? null,
      windowLabel: (txn as any).windowLabel ?? null,
      status: TradeStatus.NEGOTIATING,
      round: 0,
      // lastActor may be nullable in your schema; omit if required to be non-null
    },
  });

  return created;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = (params.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // 1) Ensure Trade exists (supports Trade.id or Transaction.id)
    const trade = await ensureTradeFromAnyId(id);
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2) AuthZ: must be seller on this trade
    const viewer = await getViewer(req, trade as any);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3) Parse and validate body
    const { pricePerAf, volumeAf, windowLabel } = await readBody(req);
    const pricePerAfNum = Number(pricePerAf);
    const volumeAfNum = Number(volumeAf);

    if (!Number.isFinite(pricePerAfNum) || !Number.isFinite(volumeAfNum)) {
      return NextResponse.json(
        { error: "pricePerAf (cents) and volumeAf (AF) must be numeric" },
        { status: 400 }
      );
    }
    if (pricePerAfNum <= 0 || volumeAfNum <= 0) {
      return NextResponse.json(
        { error: "pricePerAf and volumeAf must be greater than 0" },
        { status: 400 }
      );
    }

    // 4) Optional guard: seller’s counter should not be below current ask
    if (typeof trade.pricePerAf === "number" && pricePerAfNum < (trade as any).pricePerAf) {
      return NextResponse.json(
        { error: `Counter price must be at least ${((trade as any).pricePerAf / 100).toFixed(2)} USD/AF.` },
        { status: 400 }
      );
    }

    // 5) Update Trade with seller counter
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_SELLER,
        pricePerAf: pricePerAfNum,
        volumeAf: volumeAfNum,
        windowLabel:
          typeof windowLabel === "string" && windowLabel.trim() ? windowLabel.trim() : null,
        round: (trade as any).round ? (trade as any).round + 1 : 1,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "COUNTER",
            payload: {
              previousStatus: (trade as any).status,
              pricePerAf: pricePerAfNum,
              volumeAf: volumeAfNum,
              windowLabel: typeof windowLabel === "string" ? windowLabel : null,
              round: ((trade as any).round ?? 0) + 1,
            },
          },
        },
      },
    });

    // 6) Notify buyer (lookup local users; optionally enrich via Clerk)
    const [sellerUser, buyerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: (updated as any).sellerUserId } }),
      prisma.user.findUnique({ where: { id: (updated as any).buyerUserId } }),
    ]);

    let sellerName = sellerUser?.name || "";
    let buyerName = buyerUser?.name || "";
    let buyerEmail = buyerUser?.email || "";

    if (buyerUser?.clerkId || sellerUser?.clerkId) {
      try {
        const [sellerClerk, buyerClerk] = await Promise.all([
          sellerUser?.clerkId ? clerkClient.users.getUser(sellerUser.clerkId) : null,
          buyerUser?.clerkId ? clerkClient.users.getUser(buyerUser.clerkId) : null,
        ]);
        if (sellerClerk) sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
        if (buyerClerk) {
          buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
          const primary = buyerClerk.emailAddresses?.find(
            (e) => e.id === buyerClerk.primaryEmailAddressId
          )?.emailAddress;
          const firstAny = buyerClerk.emailAddresses?.[0]?.emailAddress;
          buyerEmail = buyerEmail || primary || firstAny || "";
        }
      } catch {
        /* non-fatal */
      }
    }

    // 7) Email using your branded template (new banner/spacing)
    if (buyerEmail) {
      const viewLink = appUrl(
        `/t/${updated.id}?role=buyer${(updated as any).buyerToken ? `&token=${(updated as any).buyerToken}` : ""}`
      );
      const counterLink = `${viewLink}&action=counter`;
      const declineLink = `${viewLink}&action=decline`;

      const { html, preheader } = renderBuyerCounterEmail({
        buyerName,
        sellerName,
        offer: {
          listingTitle: (updated as any).listingTitle || "Water Trade",
          district: (updated as any).district || "—",
          waterType: (updated as any).waterType || null,
          volumeAf: updated.volumeAf ?? 0,
          pricePerAf: updated.pricePerAf ?? 0,
          windowLabel: updated.windowLabel || undefined,
        },
        viewLink,
        counterLink,
        declineLink,
      });

      await sendEmail({
        to: buyerEmail,
        subject: "Seller sent a counteroffer",
        html,
        preheader,
      });
    }

    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
