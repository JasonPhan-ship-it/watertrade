// app/api/listings/[id]/bids/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents, placeAuctionBid } from "@/lib/bids";

// ---- helpers -----------------------------------------------------

async function getOrCreateLocalUser(clerkUserId: string) {
  let user = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
  if (user) return user;

  const cu = await clerkClient.users.getUser(clerkUserId).catch(() => null);
  const email =
    cu?.emailAddresses?.find((e) => e.id === cu?.primaryEmailAddressId)?.emailAddress ??
    cu?.emailAddresses?.[0]?.emailAddress ??
    `${clerkUserId}@example.invalid`;
  const name =
    [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;

  user = await prisma.user.create({
    data: {
      clerkId: clerkUserId,
      email,
      name: name ?? undefined,
    },
  });
  return user;
}

// ---- GET: list bids for listing ----------------------------------
// Returns: { listing, highestBidCents, reservePriceCents, bids: [...] }
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      isAuction: true,
      status: true,
      sellerId: true,
      reservePrice: true,     // cents per AF
      auctionEndsAt: true,
      pricePerAF: true,       // cents per AF (treat as starting price)
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (!listing.isAuction) {
    return NextResponse.json({ error: "Listing is not an auction" }, { status: 400 });
  }

  const bids = await prisma.bid.findMany({
    where: { listingId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      pricePerAF: true, // cents
      createdAt: true,
      bidder: { select: { id: true, name: true, email: true } },
    },
    take: 200,
  });

  const highestBidCents = bids.length ? bids[0].pricePerAF : null;

  return NextResponse.json({
    listing: {
      id: listing.id,
      title: listing.title,
      status: listing.status,
      auctionEndsAt: listing.auctionEndsAt,
      startingPriceCents: listing.pricePerAF,
    },
    reservePriceCents: listing.reservePrice,
    highestBidCents,
    bids,
  });
}

// ---- POST: place a bid -------------------------------------------
// Body: { pricePerAF: number }  // dollars (UI) or cents (if you prefer)
// Optional: allow "pricePerAFCents" to pass cents directly
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await getOrCreateLocalUser(userId);
    const { id } = params;
    
    const body = await req.json().catch(() => ({}));
    // Allow either pricePerAF ($) or pricePerAFCents
    const pricePerAFCents =
      typeof body.pricePerAFCents === "number" && Number.isFinite(body.pricePerAFCents)
        ? Math.round(body.pricePerAFCents)
        : dollarsToCents(body.pricePerAF);

    if (pricePerAFCents == null || pricePerAFCents <= 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }

    const result = await placeAuctionBid({
      listingId: id,
      bidderId: me.id,
      pricePerAFCents,
    });

    if ("error" in result) {
      const { error, status, minCents } = result;
      return NextResponse.json({ error, ...(minCents ? { minCents } : {}) }, { status });
    }

    return NextResponse.json({
      ok: true,
      bid: result.bid,
      highestBidCents: result.highestBidCents,
      meetsReserve: result.meetsReserve,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
