// app/api/transactions/buy-now/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Require an authenticated user
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Pull listingId from either JSON body OR querystring (body is optional; we ignore any acreFeet the client tries to send)
    let listingId = "";
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        const body = (await req.json().catch(() => ({}))) as { listingId?: string };
        listingId = (body?.listingId || "").trim();
      }
    } catch /* ignore malformed json */ {}

    if (!listingId) {
      const url = new URL(req.url);
      listingId = (url.searchParams.get("listingId") || "").trim();
    }

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    // Resolve the DB user for this Clerk user
    const buyer = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!buyer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Load listing details from DB; price + sellerId are authoritative here (no client input)
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        pricePerAF: true,    // cents (authoritative)
        sellerId: true,      // required by Transaction.sellerId
        // Below are optional / best-effort fields; present in many schemas:
        // district: true,
        // waterType: true,
        // defaultOrderAF: true,
        // acreFeet: true,
        // volumeAf: true,
        // availableAF: true,
        // minOrderAF: true,
      } as any,
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId) return NextResponse.json({ error: "Listing is missing sellerId" }, { status: 400 });

    // Price comes from listing (DB), not the client
    const pricePerAF = Number(listing.pricePerAF || 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }

    // Quantity (acreFeet) is derived from the listing (DB), not the client
    // Try common field names in order; fall back to 1 AF if none exist.
    const rawQty =
      Number((listing as any).defaultOrderAF) ||
      Number((listing as any).acreFeet) ||
      Number((listing as any).volumeAf) ||
      Number((listing as any).minOrderAF) ||
      Number((listing as any).availableAF) ||
      1;

    const acreFeet = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty) : 1;

    const totalAmount = pricePerAF * acreFeet; // cents

    // Create the Transaction using only server-side (DB) values
    const tx = await prisma.transaction.create({
      data: {
        type: TransactionType.BUY_NOW,
        status: TransactionStatus.INITIATED,    // or omit if you have a DB default
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,

        // Snapshots (safe to include if your schema has them; otherwise omit)
        listingTitleSnapshot: listing.title,
        // districtSnapshot: (listing as any).district ?? null,
        // waterTypeSnapshot: (listing as any).waterType ?? null,

        pricePerAF,                 // cents (from listing)
        acreFeet,                   // derived from listing
        totalAmount,                // computed
      },
      select: { id: true },
    });

    const res = NextResponse.json({ id: tx.id, acreFeet, pricePerAF, totalAmount }, { status: 201 });
    res.headers.set("Location", `/transactions/${tx.id}?action=review`);
    return res;
  } catch (e: any) {
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
