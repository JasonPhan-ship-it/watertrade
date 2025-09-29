// app/api/transactions/buy-now/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@prisma/client";
import { appUrl, sendEmail, renderSellerDocsReadyPurchasedEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // 1) Auth
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 2) listingId from JSON body OR querystring
    let listingId = "";
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as { listingId?: string };
      listingId = (body?.listingId || "").trim();
    }
    if (!listingId) {
      const url = new URL(req.url);
      listingId = (url.searchParams.get("listingId") || "").trim();
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
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        pricePerAF: true, // cents
        acreFeet: true,   // quantity to purchase
        // Optional fields if you have them:
        // districtName: true,
        // waterType: true,
        // windowLabel: true,
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId) {
      return NextResponse.json({ error: "Listing is missing sellerId" }, { status: 400 });
    }

    // 5) Validate price & quantity
    const pricePerAF = Number(listing.pricePerAF || 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }
    const acreFeet = Math.max(1, Math.floor(Number(listing.acreFeet) || 1));
    const totalAmount = pricePerAF * acreFeet; // cents

    // 6) Create transaction
    const tx = await prisma.transaction.create({
      data: {
        type: TransactionType.BUY_NOW,
        status: TransactionStatus.INITIATED,
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        // Snapshots
        listingTitleSnapshot: listing.title ?? null,
        pricePerAF,   // cents
        acreFeet,     // integer AF
        totalAmount,  // cents
      },
      select: { id: true, acreFeet: true, pricePerAF: true, totalAmount: true, sellerId: true },
    });

    // 7) Load seller (for email)
    const seller = await prisma.user.findUnique({
      where: { id: listing.sellerId },
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
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
