// app/api/transactions/buy-now/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  ListingStatus,
  TransactionType,
  TransactionStatus,
  TradeStatus,
  SignatureProgress,
  Prisma,
} from "@prisma/client";
import { appUrl, sendEmail, renderBuyerSignatureRequestEmail } from "@/lib/email";
import { createBuyerSignatureLink, ensureTradeFromAnyIdOrCreate } from "@/lib/trade";

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

    // 8) Ensure a trade exists so we can manage signing state
    const trade = await ensureTradeFromAnyIdOrCreate(tx.id);
    if (!trade) {
      throw new HttpError(500, "Unable to initialize trade for transaction");
    }

    const buyerSignLink = await createBuyerSignatureLink(trade.id, (trade as any).buyerToken);

    await prisma.trade
      .update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.ACCEPTED_PENDING_BUYER_SIGNATURE,
          buyerSignStatus: SignatureProgress.REQUESTED,
          sellerSignStatus: SignatureProgress.NONE,
          buyerSignUrl: buyerSignLink,
          sellerSignUrl: null,
          events: {
            create: {
              actor: "buyer",
              kind: "BUY_NOW_INITIATED",
              payload: {
                previousStatus: (trade as any).status,
                buyerSignStatus: (trade as any).buyerSignStatus,
                sellerSignStatus: (trade as any).sellerSignStatus,
              },
            },
          },
        },
      })
      .catch((err) => {
        console.warn("[buy-now] failed to update trade state", err);
      });

    await prisma.transaction
      .update({
        where: { id: tx.id },
        data: {
          status: TransactionStatus.PENDING_BUYER_SIGNATURE,
          buyerSignUrl: buyerSignLink,
          sellerSignUrl: null,
        },
      })
      .catch((err) => {
        console.warn("[buy-now] failed to update transaction state", err);
      });

    // 9) Email buyer with DocuSign link (best-effort)
    if (buyer.email) {
      try {
        const buyerViewLink = appUrl(
          `/t/${trade.id}?role=buyer${(trade as any).buyerToken ? `&token=${(trade as any).buyerToken}` : ""}&action=awaiting-buyer-signature`
        );
        const { html, preheader } = renderBuyerSignatureRequestEmail({
          buyerName: buyer.name ?? undefined,
          sellerName: seller?.name ?? undefined,
          offer: {
            listingTitle: listing.title || "Water sale",
            district: (listing as any).districtName || "",
            waterType: (listing as any).waterType || undefined,
            volumeAf: acreFeet,
            pricePerAf: pricePerAF,
            windowLabel: (listing as any).windowLabel || undefined,
          },
          signLink: appUrl(`/api/signing/buyer?tx=${tx.id}`),
          viewLink: buyerViewLink,
        });

        await sendEmail({
          to: buyer.email,
          subject: "Please sign to confirm your purchase",
          html,
          preheader,
        });
      } catch (err) {
        console.error("[buy-now] buyer email failed (non-fatal):", err);
      }
    }

    // 10) Respond with transaction + signing link
    const res = NextResponse.json(
      { id: tx.id, acreFeet, pricePerAF, totalAmount, signUrl: buyerSignLink },
      { status: 201 }
    );
    res.headers.set("Location", `/t/${trade.id}?role=buyer&action=awaiting-buyer-signature`);
    return res;
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
