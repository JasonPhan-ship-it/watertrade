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

    // Pull listing from DB (authoritative source of price & default qty)
    const listingSelect = {
      id: true,
      title: true,
      sellerId: true,
      pricePerAF: true,        // cents
      // Optional fields (only used if present in your schema)
      district: true,
      waterType: true,
      defaultOrderAF: true,
      acreFeet: true,
      volumeAf: true,
      availableAF: true,
      minOrderAF: true,
    } as const;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: listingSelect,
    });

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId) {
      return NextResponse.json({ error: "Listing is missing sellerId" }, { status: 400 });
    }

    // Price from DB
    const pricePerAF = Number(listing.pricePerAF || 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }

    // Quantity from DB (ignore client input)
    const qtyCandidates = [
      (listing as any).defaultOrderAF,
      (listing as any).acreFeet,
      (listing as any).volumeAf,
      (listing as any).minOrderAF,
      (listing as any).availableAF,
    ]
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);

    const acreFeet = Math.floor(qtyCandidates[0] ?? 1);
    const totalAmount = pricePerAF * acreFeet; // cents

    // Create transaction
    const tx = await prisma.transaction.create({
      data: {
        type: TransactionType.BUY_NOW,
        status: TransactionStatus.INITIATED, // (or rely on DB default)
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,

        // Snapshots (include only if your schema has these)
        listingTitleSnapshot: listing.title ?? null,
        // districtSnapshot: listing.district ?? null,
        // waterTypeSnapshot: listing.waterType ?? null,

        pricePerAF,  // cents
        acreFeet,    // integer AF
        totalAmount, // cents
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
