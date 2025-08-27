// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import {
  sendEmail,
  appUrl,
  renderBuyerAcceptedEmail,
} from "@/lib/email";
import { createBuyerSignatureLink } from "@/lib/trade";

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
            payload: { previousStatus: trade.status, round: trade.round },
          },
        },
      },
      select: {
        id: true,
        status: true,
        transactionId: true,
        // include fields for the email summary
        windowLabel: true,
        district: true,
        waterType: true,
        volumeAf: true,
        pricePerAf: true,
        buyerUserId: true,
        sellerUserId: true,
      },
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

    // ---- Notify buyer to sign ----
    // Prefer local email, fallback to Clerk by clerkId
    const [buyerLocal, sellerLocal] = await Promise.all([
      prisma.user.findUnique({
        where: { id: updated.buyerUserId || "" },
        select: { email: true, name: true, clerkId: true },
      }),
      prisma.user.findUnique({
        where: { id: updated.sellerUserId || "" },
        select: { name: true, clerkId: true },
      }),
    ]);

    let buyerName = buyerLocal?.name || "";
    let sellerName = sellerLocal?.name || "";
    let buyerEmail = buyerLocal?.email || "";

    if ((!buyerEmail || !buyerName) && buyerLocal?.clerkId) {
      try {
        const buyerClerk = await clerkClient.users.getUser(buyerLocal.clerkId);
        buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
        const primary =
          buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)?.emailAddress;
        buyerEmail = buyerEmail || primary || buyerClerk.emailAddresses?.[0]?.emailAddress || "";
      } catch {/* non-fatal */}
    }
    if (!sellerName && sellerLocal?.clerkId) {
      try {
        const sellerClerk = await clerkClient.users.getUser(sellerLocal.clerkId);
        sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
      } catch {/* non-fatal */}
    }

    // Build links for buyer
    const signLink = await createBuyerSignatureLink(updated.id, (trade as any).buyerToken);
    const viewLinkForBuyer = appUrl(
      `/t/${updated.id}?role=buyer${(trade as any).buyerToken ? `&token=${(trade as any).buyerToken}` : ""}&action=review`
    );

    if (buyerEmail) {
      const { html, preheader } = renderBuyerAcceptedEmail({
        buyerName: buyerName || "Buyer",
        sellerName: sellerName || "Seller",
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

      try {
        await sendEmail({
          to: buyerEmail,
          subject: "Seller accepted — review & sign",
          html,
          preheader,
        });
      } catch (e) {
        console.warn("[seller/accept] sendEmail failed:", (e as any)?.message);
        // do not fail the accept flow if email provider hiccups
      }
    } else {
      console.warn("[seller/accept] No buyer email available; skipped email.");
    }

    // Build a URL for seller’s UI (no redirect here—client will navigate or show a banner)
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
      message: "Awaiting buyer signature",
      redirectUrl: redirectUrl.toString(),
    });
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
