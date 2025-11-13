// app/api/transactions/buy-now/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  ListingStatus,
  TransactionType,
  TransactionStatus,
  Prisma,
} from "@prisma/client";
import { appUrl, sendEmail, renderSellerDocsReadyPurchasedEmail } from "@/lib/email";

export const runtime = "nodejs";

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ACTIVE_BUY_NOW_STATUSES = Object.values(TransactionStatus).filter(
  (status) => status !== TransactionStatus.CANCELLED
);

export async function POST(req: NextRequest) {
  try {
    // 1) Auth
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 2) listingId from JSON body OR querystring
    let listingId = "";
    let buyerWaterAccount = "";
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as {
        listingId?: string;
        buyerWaterAccount?: string;
      };
      listingId = (body?.listingId || "").trim();
      buyerWaterAccount = typeof body?.buyerWaterAccount === "string" ? body.buyerWaterAccount.trim() : "";
    }
    if (!listingId) {
      const url = new URL(req.url);
      listingId = (url.searchParams.get("listingId") || "").trim();
      if (!buyerWaterAccount) {
        buyerWaterAccount = (url.searchParams.get("buyerWaterAccount") || "").trim();
      }
    }
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    // 3) Resolve buyer (app user) from Clerk
    const buyer = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, name: true, email: true },
    });
    if (!buyer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 4) Pull listing from DB (authoritative price & quantity)
    const { listing, transaction: tx } = await prisma.$transaction(async (db) => {
      const conflict = await db.transaction.findFirst({
        where: {
          listingId,
          type: TransactionType.BUY_NOW,
          status: { in: ACTIVE_BUY_NOW_STATUSES },
        },
        select: { id: true, status: true },
      });

      if (conflict) {
        throw new HttpError(
          409,
          "A Buy Now purchase is already in progress for this listing."
        );
      }

      const listingRow = await db.listing
        .update({
          where: { id: listingId, status: ListingStatus.ACTIVE },
          data: { status: ListingStatus.UNDER_CONTRACT },
          select: {
            id: true,
            title: true,
            sellerId: true,
            pricePerAF: true,
            acreFeet: true,
            status: true,
            sellerFarmId: true,
            buyerWaterAccount: true,
            // Optional fields if you have them:
            // districtName: true,
            // waterType: true,
            // windowLabel: true,
          },
        })
        .catch((err) => {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2025"
          ) {
            throw new HttpError(409, "This listing is no longer available to purchase.");
          }
          throw err;
        });

      if (!listingRow.sellerId) {
        throw new HttpError(400, "Listing is missing sellerId");
      }

      const pricePerAF = Number(listingRow.pricePerAF || 0);
      if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
        throw new HttpError(400, "Listing has invalid price");
      }

      const acreFeet = Math.max(1, Math.floor(Number(listingRow.acreFeet) || 1));
      const totalAmount = pricePerAF * acreFeet;

      const transaction = await db.transaction.create({
        data: {
          type: TransactionType.BUY_NOW,
          status: TransactionStatus.INITIATED,
          listing: { connect: { id: listingRow.id } },
          buyer: { connect: { id: buyer.id } },
          seller: { connect: { id: listingRow.sellerId } },
          listingTitleSnapshot: listingRow.title ?? null,
          pricePerAF,
          acreFeet,
          totalAmount,
          buyerWaterAccount:
            buyerWaterAccount || listingRow.buyerWaterAccount || null,
          sellerFarm: listingRow.sellerFarmId
            ? { connect: { id: listingRow.sellerFarmId } }
            : undefined,
        },
        select: {
          id: true,
          acreFeet: true,
          pricePerAF: true,
          totalAmount: true,
          sellerId: true,
        },
      });

      return { listing: listingRow, transaction };
    });

    const { acreFeet, pricePerAF, totalAmount } = tx;

    // 7) Load seller (for email)
    const sellerId = listing.sellerId;
    if (!sellerId) {
      throw new HttpError(500, "Listing is missing sellerId");
    }
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { name: true, email: true },
    });

    // 8) Fire seller email with DocuSign redirect CTA (best-effort; do not block API)
    if (seller?.email) {
      try {
        const signLink = appUrl(`/api/signing/seller?tx=${tx.id}`); // ✅ goes to DocuSign
        const viewLink = appUrl(`/transactions/${tx.id}`);

        const { html, preheader } = renderSellerDocsReadyPurchasedEmail({
          sellerName: seller.name ?? undefined,
          buyerName: buyer.name || buyer.email || undefined,
          offer: {
            listingTitle: listing.title || "Water sale",
            district: (listing as any).districtName || "",           // if you have it
            waterType: (listing as any).waterType || undefined,      // if you have it
            volumeAf: acreFeet,
            pricePerAf: pricePerAF,                                   // cents
            windowLabel: (listing as any).windowLabel || undefined,   // if you have it
          },
          signLink,   // 👈 IMPORTANT: DocuSign redirector endpoint
          viewLink,   // secondary
        });

        await sendEmail({
          to: seller.email,
          subject: "Buyer purchased at your set price — documents ready to sign",
          html,
          preheader,
        });
      } catch (err) {
        console.error("[buy-now] seller email failed (non-fatal):", err);
      }
    } else {
      console.warn("[buy-now] seller has no email; skipped seller notification for tx", tx.id);
    }

    // 9) Respond as before
    const res = NextResponse.json(
      { id: tx.id, acreFeet, pricePerAF, totalAmount },
      { status: 201 }
    );
    res.headers.set("Location", `/transactions/${tx.id}?action=review`);
    return res;
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
