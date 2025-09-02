// app/api/trades/[id]/seller/counter/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { sendEmail, appUrl, renderBuyerCounterEmail } from "@/lib/email";

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

/** Ensure a Trade exists given either a Trade.id or a Transaction.id, and satisfy required fields. */
async function ensureTradeFromAnyIdOrThrow(id: string) {
  // If id is already a Trade.id (or we can derive a Trade by tx id), return it.
  const existing = await findTradeByAnyId(id);
  if (existing) return existing;

  // Otherwise, treat id as a Transaction.id and try to create a Trade from it.
  const txn = await prisma.transaction.findUnique({ where: { id } });
  if (!txn) return null;

  // Resolve required fields for Trade from Transaction and/or its Listing.
  const listingIdFromTxn = (txn as any).listingId ?? null;
  const listing = listingIdFromTxn
    ? await prisma.listing.findUnique({ where: { id: listingIdFromTxn } })
    : null;

  const listingId = listing?.id ?? listingIdFromTxn ?? null;
  const district =
    (txn as any).district ??
    (listing as any)?.district ??
    null;

  if (!listingId || !district) {
    // Fail fast with a helpful message instead of a Prisma type error
    throw new Error(
      "Cannot create Trade: missing listingId or district on Transaction/Listing. Ensure the Transaction has listingId and district (or the related Listing has district)."
    );
  }

  // Choose a valid initial status for your enum; NEGOTIATING isn't in your schema.
  const initialStatus = TradeStatus.OFFERED;

  const data: any = {
    transactionId: txn.id,
    listingId,
    district, // required by your Trade model

    sellerUserId: (txn as any).sellerUserId ?? null,
    buyerUserId: (txn as any).buyerUserId ?? null,

    // Seed participant info if you keep these on Trade (optional in your schema)
    sellerEmail: (txn as any).sellerEmail ?? (txn as any).seller_user_email ?? undefined,
    buyerEmail:  (txn as any).buyerEmail  ?? (txn as any).buyer_user_email  ?? undefined,
    sellerName:  (txn as any).sellerName  ?? (txn as any).seller_user_name  ?? undefined,
    buyerName:   (txn as any).buyerName   ?? (txn as any).buyer_user_name   ?? undefined,

    // Seed initial terms if present
    pricePerAf:  (txn as any).pricePerAf  ?? undefined,
    volumeAf:    (txn as any).volumeAf    ?? undefined,
    windowLabel: (txn as any).windowLabel ?? undefined,

    status: initialStatus,
    round: 0,
  };

  // Remove undefined keys so Prisma doesn’t complain about nullability
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  const created = await prisma.trade.create({ data });
  return created;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = (params.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // 1) Ensure Trade exists (accepts Trade.id or Transaction.id)
    let trade;
    try {
      trade = await ensureTradeFromAnyIdOrThrow(id);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Unable to create Trade" }, { status: 422 });
    }
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2) AuthZ: must be seller on this trade
    const viewer = await getViewer(req, trade as any);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3) Parse & validate body
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

    // 4) Optional guard: do not counter below current ask
    if (typeof (trade as any).pricePerAf === "number" && pricePerAfNum < (trade as any).pricePerAf) {
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

    // 6) Notify buyer
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
      } catch { /* non-fatal */ }
    }

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
