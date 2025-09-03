// app/api/transactions/buy-now/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // Auth
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // listingId from JSON body OR querystring
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

    // Resolve buyer (app user) from Clerk
    const buyer = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!buyer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Pull listing from DB (authoritative source of price & quantity)
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        pricePerAF: true, // cents
        acreFeet: true,   // quantity to purchase (server-driven)
      },
    });

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId) {
      return NextResponse.json({ error: "Listing is missing sellerId" }, { status: 400 });
    }

    // Price from DB (cents)
    const pricePerAF = Number(listing.pricePerAF || 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }

    // Quantity from DB (no client input)
    const acreFeet = Math.max(1, Math.floor(Number(listing.acreFeet) || 1));

    const totalAmount = pricePerAF * acreFeet; // cents

    // Create transaction
    const tx = await prisma.transaction.create({
      data: {
        type: TransactionType.BUY_NOW,
        status: TransactionStatus.INITIATED, // or rely on DB default
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        // Snapshots (include only if they exist on your schema)
        listingTitleSnapshot: listing.title ?? null,
        pricePerAF,   // cents
        acreFeet,     // integer AF
        totalAmount,  // cents
      },
      select: { id: true },
    });

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
