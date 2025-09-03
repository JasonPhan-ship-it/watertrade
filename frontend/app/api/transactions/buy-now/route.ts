// app/api/transactions/buy-now/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    // --- Auth ---
    const { userId: clerkId } = auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- listingId from URL (?listingId=...) OR JSON fallback ---
    const url = new URL(req.url);
    let listingId = (url.searchParams.get("listingId") || "").trim();

    if (!listingId && req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as any;
      listingId = String(body?.listingId || "").trim();
    }

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    // --- Buyer (from Clerk) ---
    const buyer = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // --- Listing (server = source of truth) ---
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        pricePerAF: true,   // cents
        // Optional fields if present in your schema; used for qty inference/snapshots:
        acreFeet: true,
        defaultOrderAF: true,
        availableAF: true,
        minOrderAF: true,
        volumeAf: true,
        // district: true,
        // waterType: true,
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (!listing.sellerId) {
      return NextResponse.json({ error: "Listing is missing sellerId" }, { status: 422 });
    }

    const pricePerAF = Number(listing.pricePerAF ?? 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid pricePerAF (must be > 0 cents)" }, { status: 422 });
    }

    // --- Quantity decided on the server ---
    // Policy: prefer explicit defaults if present, else full lot, else 1 AF.
    const qtyCandidates = [
      (listing as any).defaultOrderAF,
      (listing as any).acreFeet,
      (listing as any).minOrderAF,
      (listing as any).availableAF,
      (listing as any).volumeAf,
    ]
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);

    const acreFeet = Math.max(1, Math.floor(qtyCandidates[0] ?? 1));
    // If you want to ALWAYS default to 1 AF, replace the line above with:
    // const acreFeet = 1;

    const totalAmount = pricePerAF * acreFeet; // cents

    // --- Create transaction ---
    const tx = await prisma.transaction.create({
      data: {
        type: TransactionType.BUY_NOW,
        status: TransactionStatus.INITIATED, // or omit if DB default exists
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,

        // Snapshots (uncomment if your schema has these columns)
        listingTitleSnapshot: listing.title ?? null,
        // districtSnapshot: listing.district ?? null,
        // waterTypeSnapshot: listing.waterType ?? null,

        pricePerAF,      // cents
        acreFeet,        // integer AF
        totalAmount,     // cents
      },
      select: { id: true },
    });

    const res = NextResponse.json({ id: tx.id }, { status: 201 });
    res.headers.set("Location", `/transactions/${tx.id}?action=review`);
    return res;
  } catch (err: any) {
    console.error("[/api/transactions/buy-now] error", {
      message: err?.message,
      stack: err?.stack,
      tookMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
