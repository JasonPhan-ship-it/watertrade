// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, appUrl, renderBuyerAcceptedEmail } from "@/lib/email";
import { createBuyerSignatureLink } from "@/lib/trade";

/* ---------- helpers ---------- */

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
      windowLabel:  (txn as any).windowLabel  ?? undefined,
      status: pickAcceptedPendingTradeStatus() ?? TradeStatus.OFFERED, // safe default
      round: 0,
    } as any,
  });

  return created;
}

/** Pick a valid "accepted pending buyer signature" trade status, with fallbacks */
function pickAcceptedPendingTradeStatus(): (typeof TradeStatus)[keyof typeof TradeStatus] | null {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_BUYER_SIGNATURE ??
    TS.ACCEPTED_AWAITING_BUYER_SIGNATURE ??
    TS.ACCEPTED_WAITING_FOR_BUYER ??
    TS.ACCEPTED ?? // generic accepted if you don't model "pending signature"
    null
  );
}

/** Pick a "pending buyer signature" transaction status that exists in your enum */
function pickTxnPendingBuyerSig(): (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return (
    TXS.PENDING_BUYER_SIGNATURE ??
    TXS.PENDING_SIGNATURE ??
    TXS.PENDING ??
    TXS.ACCEPTED ??
    null
  );
}

/** Ensure we have buyer name/email; enrich Trade row if missing */
async function ensureBuyerIdentityOnTrade(tradeId: string, buyerUserId?: string | null) {
  let buyerName = "";
  let buyerEmail = "";

  // 1) Try local User
  if (buyerUserId) {
    const buyerLocal = await prisma.user.findUnique({
      where: { id: buyerUserId },
      select: { name: true, email: true, clerkId: true },
    });

    if (buyerLocal) {
      buyerName = buyerLocal.name || "";
      buyerEmail = buyerLocal.email || "";

      // 2) If still missing, try Clerk
      if ((!buyerEmail || !buyerName) && buyerLocal.clerkId) {
        try {
          const u = await clerkClient.users.getUser(buyerLocal.clerkId);
          buyerName = buyerName || u.firstName || u.username || "";
          const primary =
            u.emailAddresses?.find(e => e.id === u.primaryEmailAddressId)?.emailAddress;
          buyerEmail = buyerEmail || primary || u.emailAddresses?.[0]?.emailAddress || "";
        } catch { /* non-fatal */ }
      }
    }
  }

  // 3) Persist onto Trade for downstream signing/email flows (best-effort)
  if (buyerName || buyerEmail) {
    try {
      await prisma.trade.update({
        where: { id: tradeId },
        data: {
          buyerName: buyerName || undefined,
          buyerEmail: buyerEmail || undefined,
        } as any,
      });
    } catch { /* ignore */ }
  }

  return { buyerName, buyerEmail };
}

/* ---------- handlers ---------- */

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Accept Trade.id OR Transaction.id
    const trade = await ensureTradeFromAnyIdOrThrow(rawId);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", hint: "No Trade with this id or transactionId" },
        { status: 404 }
      );
    }

    // AuthZ: must be seller
    const viewer = await getViewer(req as any, trade as any);
    if (!viewer || viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Move Trade to "accepted / pending buyer signature"
    const TRADE_ACCEPTED = pickAcceptedPendingTradeStatus() ?? TradeStatus.ACCEPTED;
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TRADE_ACCEPTED,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "ACCEPT",
            payload: { previousStatus: (trade as any).status, round: (trade as any).round },
          },
        },
      },
      select: {
        id: true, status: true, transactionId: true,
        windowLabel: true, district: true, waterType: true,
        volumeAf: true, pricePerAf: true,
        buyerUserId: true, sellerUserId: true,
      },
    });

    // Sync Transaction status (best-effort)
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

    // Ensure buyer name/email for signing + email
    const { buyerName, buyerEmail } = await ensureBuyerIdentityOnTrade(
      updated.id,
      updated.buyerUserId || null
    );
    if (!buyerEmail) {
      // Don’t proceed to create a signing link without an email—surface a clear error
      return NextResponse.json(
        { error: "Missing buyer email on trade; cannot start signing session." },
        { status: 422 }
      );
    }

    // Create buyer signing link (can throw if underlying HTTP fails)
    let signLink = "";
    try {
      // If you store a buyerToken on Trade, pass it here; otherwise omit.
      const buyerToken = (trade as any).buyerToken || undefined;
      signLink = await createBuyerSignatureLink(updated.id, buyerToken);
    } catch (e: any) {
      console.error("[seller/accept] createBuyerSignatureLink failed:", e?.message || e);
      return NextResponse.json(
        { error: "Could not start signing session (upstream request failed)." },
        { status: 502 }
      );
    }

    // Build buyer view link
    const viewLinkForBuyer = appUrl(
      `/t/${updated.id}?role=buyer${(trade as any).buyerToken ? `&token=${(trade as any).buyerToken}` : ""}&action=review`
    );

    // Send email (best-effort)
    try {
      const { html, preheader } = renderBuyerAcceptedEmail({
        buyerName: buyerName || "Buyer",
        sellerName: (await prisma.user.findUnique({ where: { id: updated.sellerUserId || "" }, select: { name: true } }))?.name || "Seller",
        offer: {
          listingTitle: updated.windowLabel || "Offer Terms",
          district: updated.district || "",
          waterType: updated.waterType ?? undefined,
          volumeAf: updated.volumeAf,
          pricePerAf: updated.pricePerAf,
          windowLabel: updated.windowLabel ?? undefined,
        },
        signLink,
        viewLink: viewLinkForBuyer,
      });

      await sendEmail({
        to: buyerEmail,
        subject: "Seller accepted — review & sign",
        html,
        preheader,
      });
    } catch (e) {
      console.warn("[seller/accept] sendEmail failed:", (e as any)?.message);
    }

    // Build a suggested redirect for the caller (seller UI)
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inUrl = new URL(req.url);
    const token = inUrl.searchParams.get("token") || undefined;
    const role = inUrl.searchParams.get("role") || "seller";

    const redirectUrl = new URL(`/t/${updated.id}`, base);
    redirectUrl.searchParams.set("role", role);
    redirectUrl.searchParams.set("action", "awaiting-buyer-signature");
    if (token) redirectUrl.searchParams.set("token", token);

    return NextResponse.json({
      ok: true,
      tradeId: updated.id,
      status: updated.status,
      signLink, // useful for clients that want to deep-link to signing
      message: "Awaiting buyer signature",
      redirectUrl: redirectUrl.toString(),
    });
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
