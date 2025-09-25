export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { sendEmail, appUrl, renderBuyerCounterEmail } from "@/lib/email";

/** Body parsing that accepts JSON or form-data (NO window fields) */
async function readBody(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as any;
    return {
      pricePerAf: j.pricePerAf ?? j.pricePerAF ?? j.price_per_af,
      volumeAf: j.volumeAf ?? j.acreFeet ?? j.quantity,
    };
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return {};
  return {
    pricePerAf: fd.get("pricePerAf") ?? fd.get("pricePerAF") ?? fd.get("price_per_af"),
    volumeAf: fd.get("volumeAf") ?? fd.get("acreFeet") ?? fd.get("quantity"),
  };
}

/** Create or fetch a Trade given a Trade.id OR a Transaction.id */
async function ensureTradeFromAnyIdOrThrow(id: string) {
  const existing = await findTradeByAnyId(id);
  if (existing) return existing;

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { listing: { select: { id: true, district: true, title: true, waterType: true } } },
  });
  if (!txn) return null;

  const listingId = txn.listing?.id ?? null;
  const district =
    (txn as any).districtSnapshot ??
    txn.listing?.district ??
    null;

  if (!listingId || !district) {
    throw new Error("Cannot create Trade: missing listingId or district on Transaction/Listing.");
  }

  const created = await prisma.trade.create({
    data: {
      transactionId: txn.id,
      listingId,
      district,
      sellerUserId: (txn as any).sellerUserId ?? (txn as any).sellerId ?? undefined,
      buyerUserId:  (txn as any).buyerUserId  ?? (txn as any).buyerId  ?? undefined,
      pricePerAf:   (txn as any).pricePerAf   ?? (txn as any).pricePerAF ?? undefined,
      volumeAf:     (txn as any).volumeAf     ?? (txn as any).acreFeet   ?? undefined,
      status: TradeStatus.OFFERED,
      round: 0,
    } as any,
  });

  return created;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = (params.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing id", errorCode: "MISSING_ID" }, { status: 400 });

    // Ensure Trade exists (Trade.id or Transaction.id accepted)
    let trade;
    try {
      trade = await ensureTradeFromAnyIdOrThrow(id);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Unable to create Trade", errorCode: "CREATE_FAILED" }, { status: 422 });
    }
    if (!trade) return NextResponse.json({ error: "Not found", errorCode: "NOT_FOUND" }, { status: 404 });

    // AuthZ: must be seller
    const viewer = await getViewer(req, trade as any);
    if (viewer.role !== "seller") {
      const url = new URL(req.url);
      return NextResponse.json(
        {
          error: "Forbidden",
          errorCode: "FORBIDDEN",
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

    // Parse & validate input
    const { pricePerAf, volumeAf } = await readBody(req);
    const pricePerAfNum = Number(pricePerAf);
    const volumeAfNum = Number(volumeAf);

    if (!Number.isFinite(pricePerAfNum) || !Number.isFinite(volumeAfNum)) {
      return NextResponse.json(
        { error: "pricePerAf (cents) and volumeAf (AF) must be numeric", errorCode: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (pricePerAfNum <= 0 || volumeAfNum <= 0) {
      return NextResponse.json(
        { error: "pricePerAf and volumeAf must be > 0", errorCode: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Optional guard: don't counter below current ask
    if (typeof (trade as any).pricePerAf === "number" && pricePerAfNum < (trade as any).pricePerAf) {
      return NextResponse.json(
        { error: `Counter price must be at least ${((trade as any).pricePerAf / 100).toFixed(2)} USD/AF.`, errorCode: "BUSINESS_RULE" },
        { status: 400 }
      );
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_SELLER,
        pricePerAf: pricePerAfNum,
        volumeAf: volumeAfNum,
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
              round: ((trade as any).round ?? 0) + 1,
            },
          },
        },
      },
      select: {
        id: true,
        status: true,
        volumeAf: true,
        pricePerAf: true,
        district: true,
        waterType: true,
        buyerUserId: true,
        sellerUserId: true,
        buyerToken: true,
        sellerToken: true,
      },
    });

    // Notify buyer (existing) + NEW: seller confirmation
    const [sellerUser, buyerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: (updated as any).sellerUserId } }),
      prisma.user.findUnique({ where: { id: (updated as any).buyerUserId } }),
    ]);

    let sellerName = sellerUser?.name || "";
    let buyerName = buyerUser?.name || "";
    let buyerEmail = buyerUser?.email || "";
    let sellerEmail = sellerUser?.email || "";

    if (buyerUser?.clerkId || sellerUser?.clerkId) {
      try {
        const [sellerClerk, buyerClerk] = await Promise.all([
          sellerUser?.clerkId ? clerkClient.users.getUser(sellerUser.clerkId) : null,
          buyerUser?.clerkId ? clerkClient.users.getUser(buyerUser.clerkId) : null,
        ]);
        if (sellerClerk) {
          sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
          const primary = sellerClerk.emailAddresses?.find(e => e.id === sellerClerk.primaryEmailAddressId)?.emailAddress;
          sellerEmail = sellerEmail || primary || sellerClerk.emailAddresses?.[0]?.emailAddress || "";
        }
        if (buyerClerk) {
          buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
          const primary = buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)?.emailAddress;
          const firstAny = buyerClerk.emailAddresses?.[0]?.emailAddress;
          buyerEmail = buyerEmail || primary || firstAny || "";
        }
      } catch { /* non-fatal */ }
    }

    if (buyerEmail) {
      const viewLink = appUrl(`/t/${updated.id}?role=buyer${(updated as any).buyerToken ? `&token=${(updated as any).buyerToken}` : ""}`);
      const counterLink = `${viewLink}&action=counter`;
      const declineLink = `${viewLink}&action=decline`;

      const { html, preheader } = renderBuyerCounterEmail({
        buyerName,
        sellerName,
        offer: {
          listingTitle: (updated as any).windowLabel || "Water Trade",
          district: (updated as any).district || "—",
          waterType: (updated as any).waterType || null,
          volumeAf: updated.volumeAf ?? 0,
          pricePerAf: updated.pricePerAf ?? 0,
        },
        viewLink,
        counterLink,
        declineLink,
      });

      await sendEmail({ to: buyerEmail, subject: "Seller sent a counteroffer", html, preheader });
    }

    // NEW: Seller confirmation
    if (sellerEmail) {
      const sellerViewLink = appUrl(`/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}`);
      const html = `
        <p>Hi ${sellerName || "Seller"},</p>
        <p>Your counteroffer was sent to the buyer.</p>
        <ul>
          <li>Price: $${(updated.pricePerAf / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/AF</li>
          <li>Volume: ${updated.volumeAf} AF</li>
        </ul>
        <p>Thread: <a href="${sellerViewLink}">${sellerViewLink}</a></p>
      `;
      await sendEmail({ to: sellerEmail, subject: "Your counteroffer was sent", html });
    }

    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error", errorCode: "UNEXPECTED" }, { status: 500 });
  }
}
