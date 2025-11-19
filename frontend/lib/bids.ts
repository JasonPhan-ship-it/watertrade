import { prisma } from "@/lib/prisma";

type BidValidationError = {
  error: string;
  status: number;
  minCents?: number;
};

type BidPlacementResult =
  | BidValidationError
  | {
      bid: { id: string; pricePerAF: number; createdAt: Date };
      listing: {
        id: string;
        title: string | null;
        isAuction: boolean;
        status: string | null;
        sellerId: string | null;
        reservePrice: number | null;
        auctionEndsAt: Date | null;
        pricePerAF: number | null;
        acreFeet: number | null;
        seller?: { id: string; email: string | null; name: string | null } | null;
      };
      highestBidCents: number;
      meetsReserve: boolean;
    };

export function dollarsToCents(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function nowUtc() {
  return new Date();
}

export async function placeAuctionBid(options: {
  listingId: string;
  bidderId: string;
  pricePerAFCents: number;
  includeSeller?: boolean;
}): Promise<BidPlacementResult> {
  const { listingId, bidderId, pricePerAFCents, includeSeller } = options;

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      isAuction: true,
      status: true,
      sellerId: true,
      reservePrice: true, // cents
      auctionEndsAt: true,
      pricePerAF: true, // cents
      acreFeet: true,
      ...(includeSeller && { seller: { select: { id: true, email: true, name: true } } }),
    },
  });

  if (!listing) {
    return { error: "Listing not found", status: 404 };
  }
  if (!listing.isAuction) {
    return { error: "Listing is not an auction", status: 400 };
  }
  if (listing.status !== "ACTIVE") {
    return { error: "Listing is not active", status: 400 };
  }
  if (listing.auctionEndsAt && nowUtc() > listing.auctionEndsAt) {
    return { error: "Auction has ended", status: 400 };
  }
  if (listing.sellerId && listing.sellerId === bidderId) {
    return { error: "Seller cannot bid on own listing", status: 400 };
  }

  const top = await prisma.bid.findFirst({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    select: { pricePerAF: true },
  });

  const highest = top?.pricePerAF ?? listing.pricePerAF ?? 0;
  const minRequired = highest + 1; // minimum increment of $0.01/AF
  if (pricePerAFCents < minRequired) {
    return {
      error: "Bid must be at least the current highest + $0.01/AF",
      minCents: minRequired,
      status: 400,
    };
  }

  const bid = await prisma.bid.create({
    data: {
      listingId,
      bidderId,
      pricePerAF: pricePerAFCents,
    },
    select: {
      id: true,
      pricePerAF: true,
      createdAt: true,
    },
  });

  const meetsReserve =
    typeof listing.reservePrice === "number" ? bid.pricePerAF >= listing.reservePrice : true;

  return {
    bid,
    listing,
    highestBidCents: bid.pricePerAF,
    meetsReserve,
  };
}
