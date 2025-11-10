// app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { TradeStatus } from "@prisma/client";

// UI sort keys (keep legacy "availabilityEnd" for old clients)
type SortKey = "createdAt" | "pricePerAf" | "acreFeet" | "availabilityEnd" | "district";

// Map UI sort key -> DB column (strings so we can alias legacy keys safely)
const ORDER_MAP: Record<SortKey, string> = {
  createdAt: "createdAt",
  pricePerAf: "pricePerAF",
  acreFeet: "acreFeet",
  availabilityEnd: "availability", // legacy alias
  district: "district",
};

function parseQuery(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  return {
    premium: (sp.get("premium") ?? "false") === "true",
    page: Math.max(1, parseInt(sp.get("page") ?? "1", 10)),
    pageSize: Math.min(50, Math.max(1, parseInt(sp.get("pageSize") ?? "10", 10))),
    sortBy: (sp.get("sortBy") ?? "createdAt") as SortKey,
    sortDir: (sp.get("sortDir") ?? "desc") === "asc" ? "asc" : "desc",
    district: sp.get("district") ?? undefined,
    waterType: sp.get("waterType") ?? undefined,
    scope: (sp.get("scope") ?? "").toLowerCase() as "market" | "mine" | "",
    mineFlag: (sp.get("mine") ?? "") === "1",
    excludeMineFlag: (sp.get("excludeMine") ?? "") === "1",
  };
}

function noCache(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const q = parseQuery(req);

    // Viewer → DB user
    const { userId: clerkUserId } = auth();
    let viewerDbUserId: string | null = null;
    let viewerRole: "ADMIN" | "USER" | null = null;
    if (clerkUserId) {
      const viewer = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
        select: { id: true, role: true },
      });
      viewerDbUserId = viewer?.id ?? null;
      viewerRole = (viewer?.role as "ADMIN" | "USER" | null) ?? null;
    }

    const whereAND: any[] = [];
    if (q.district && q.district !== "All Districts") whereAND.push({ district: q.district });
    if (q.waterType && q.waterType !== "Any Water Type") whereAND.push({ waterType: q.waterType });

    const scope = q.scope || (q.mineFlag ? "mine" : q.excludeMineFlag ? "market" : "market");

    if (scope === "mine") {
      if (!viewerDbUserId) {
        return noCache(NextResponse.json({ listings: [], total: 0, limited: !q.premium }));
      }
      whereAND.push({ sellerId: viewerDbUserId });
    } else {
      // Marketplace: only ACTIVE & exclude my own
      whereAND.push({ status: "ACTIVE" });
      if (viewerDbUserId) whereAND.push({ NOT: { sellerId: viewerDbUserId } });
    }

    const where = whereAND.length ? { AND: whereAND } : {};

    // Paging + sorting
    const take = !q.premium ? 3 : q.pageSize;
    const skip = !q.premium ? 0 : (q.page - 1) * q.pageSize;
    const orderColumn = ORDER_MAP[q.sortBy] || "createdAt";

    const [total, rows] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        // Cast to any so we can safely pass a string key (legacy alias supported)
        orderBy: { [orderColumn]: q.sortDir } as any,
        skip,
        take,
        select: {
          id: true,
          district: true,
          waterType: true,
          acreFeet: true,
          pricePerAF: true, // cents
          availability: true, // keep reading the string field
          createdAt: true,
          status: true,
          kind: true,
          isAuction: true,
          auctionEndsAt: true,
          reservePrice: true,
          sellerId: true, // owner id for client logic
          waterCodeValue: true,
          waterCodeYear: true,
          waterCodeDescription: true,
          buyerWaterAccount: true,
          sellerFarmId: true,
        },
      }),
    ]);

    let escrowByListing: Record<string, number> = {};
    if (rows.length) {
      const listingIds = rows.map((r) => r.id);
      const acceptedStatuses = [
        TradeStatus.ACCEPTED_PENDING_BUYER_SIGNATURE,
        TradeStatus.ACCEPTED_PENDING_SELLER_SIGNATURE,
      ].filter(Boolean) as string[];

      if (acceptedStatuses.length) {
        try {
          const aggregates = await prisma.trade.groupBy({
            by: ["listingId"],
            where: {
              listingId: { in: listingIds },
              status: { in: acceptedStatuses },
            },
            _sum: { volumeAf: true },
          });
          escrowByListing = Object.fromEntries(
            aggregates.map((row) => [row.listingId, row._sum.volumeAf ?? 0])
          );
        } catch (err) {
          console.warn("[api/listings] escrow aggregation failed", err);
        }
      }
    }

    const listings = rows.map((r) => {
      const escrowVolume = Math.max(0, escrowByListing[r.id] ?? 0);
      const inEscrow = Math.min(r.acreFeet, escrowVolume);
      const availableAf = Math.max(r.acreFeet - inEscrow, 0);

      return {
        id: r.id,
        district: r.district,
        acreFeet: r.acreFeet,
        availableAf,
        inEscrowAf: inEscrow,
        pricePerAf: (r.pricePerAF ?? 0) / 100, // dollars
        // Field kept for backward compat even though DB has only "availability" (string)
        availabilityEnd: null as string | null,
        waterType: r.waterType,
        createdAt: r.createdAt.toISOString(),
        ownerUserId: r.sellerId,
        status: r.status,
        kind: r.kind,
        isAuction: r.isAuction,
        auctionEndsAt: r.auctionEndsAt ? r.auctionEndsAt.toISOString() : null,
        reservePrice: r.reservePrice != null ? r.reservePrice / 100 : null,
        availability: r.availability,
        waterCode: r.waterCodeValue,
        waterYear: r.waterCodeYear,
        waterDescription: r.waterCodeDescription,
        buyerWaterAccount: r.buyerWaterAccount,
        sellerFarmId: r.sellerFarmId,
      };
    });

    return noCache(
      NextResponse.json({ listings, total, limited: !q.premium, viewerRole }, { status: 200 })
    );
  } catch (err: any) {
    console.error("[api/listings] error", err);
    return noCache(
      NextResponse.json({ listings: [], total: 0, error: err?.message || "Internal error" }, { status: 500 })
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const me = await prisma.user.findUnique({ where: { clerkId } });
    if (!me) return NextResponse.json({ error: "Account not provisioned" }, { status: 403 });

    const body = await req.json();

    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

    // kind/type – accept both
    const kind: "SELL" | "BUY" =
      String((body.kind ?? body.type ?? "sell")).toLowerCase() === "buy" ? "BUY" : "SELL";

    const district = String(body.district || "Unknown District");
    const waterType = String(body.waterType || "Surface");
    const isAuction = Boolean(body.isAuction);

    const waterCodeValueRaw =
      typeof body.waterCodeValue === "string"
        ? body.waterCodeValue
        : typeof body.waterCode === "string"
        ? body.waterCode
        : "";
    const waterCodeYearRaw =
      typeof body.waterCodeYear === "string"
        ? body.waterCodeYear
        : typeof body.waterYear === "string"
        ? body.waterYear
        : "";
    const waterCodeDescriptionRaw =
      typeof body.waterCodeDescription === "string"
        ? body.waterCodeDescription
        : typeof body.waterDescription === "string"
        ? body.waterDescription
        : "";
    const rawWaterCodeId = typeof body.waterCodeId === "string" ? body.waterCodeId.trim() : "";
    const sellerFarmIdRaw = typeof body.sellerFarmId === "string" ? body.sellerFarmId.trim() : "";
    const buyerWaterAccountRaw =
      typeof body.buyerWaterAccount === "string" ? body.buyerWaterAccount.trim() : "";

    const waterCodeValue = waterCodeValueRaw.trim();
    const waterCodeYear = waterCodeYearRaw.trim();
    const waterCodeDescription = waterCodeDescriptionRaw.trim();

    let waterCodeRecord: { id: string; code: string; year: string; description: string | null } | null = null;
    if (rawWaterCodeId) {
      const existing = await prisma.waterCode.findUnique({ where: { id: rawWaterCodeId } });
      if (!existing) {
        return NextResponse.json({ error: "Invalid water code selection" }, { status: 400 });
      }
      waterCodeRecord = {
        id: existing.id,
        code: existing.code,
        year: existing.year,
        description: existing.description,
      };
    }

    let sellerFarmId: string | null = null;
    if (sellerFarmIdRaw) {
      const farm = await prisma.farm.findUnique({ where: { id: sellerFarmIdRaw } });
      if (!farm || farm.userId !== me.id) {
        return NextResponse.json({ error: "Invalid farm selection" }, { status: 400 });
      }
      sellerFarmId = farm.id;
    }

    // acre-feet – accept acreFeet or volumeAF
    const acreFeet = Math.max(0, Math.floor(Number(body.acreFeet ?? body.volumeAF ?? 0)));
    if (!Number.isFinite(acreFeet) || acreFeet <= 0) {
      return NextResponse.json({ error: "Acre-feet must be greater than 0" }, { status: 400 });
    }
    
    // price / reserve handling
    const rawPrice = Number(body.pricePerAF);
    const rawStartingBid = Number(body.startingBid);
    const rawReservePrice = Number(body.reservePrice);

    let pricePerAfCents = 0;
    let reservePriceCents: number | null = null;

    if (isAuction) {
      if (Number.isFinite(rawReservePrice) && rawReservePrice > 0) {
        reservePriceCents = Math.round(rawReservePrice * 100);
      }
      if (Number.isFinite(rawStartingBid) && rawStartingBid > 0) {
        pricePerAfCents = Math.round(rawStartingBid * 100);
      }
      if (reservePriceCents != null) {
        pricePerAfCents = reservePriceCents;
      }
    } else {
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
        return NextResponse.json({ error: "Price per AF must be greater than 0" }, { status: 400 });
      }
      pricePerAfCents = Math.round(rawPrice * 100);
    }

    let auctionEndsAt: Date | null = null;
    if (isAuction) {
      const endDateRaw = typeof body.endDate === "string" ? body.endDate.trim() : "";
      if (!endDateRaw) {
        return NextResponse.json({ error: "Auction end date is required" }, { status: 400 });
      }
      const endDate = new Date(endDateRaw);
      if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Auction end date must be in the future" }, { status: 400 });
      }
      auctionEndsAt = endDate;
    }

    // Compose an "availability" label (DB only stores the string today)
    const fallbackEnd = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    const availabilityEndInput = body.availabilityEnd ? new Date(body.availabilityEnd) : fallbackEnd;
    const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
    const availability = `Through ${mm(availabilityEndInput)} ${availabilityEndInput.getFullYear()}`;

    const created = await prisma.listing.create({
      data: {
        title,
        district,
        waterType,
        availability, // string only (no availabilityEnd column in DB)
        acreFeet,
        pricePerAF: pricePerAfCents, // cents
        kind,
        status: "ACTIVE",
        sellerId: me.id,
        waterCodeId: waterCodeRecord?.id ?? null,
        waterCodeValue: waterCodeValue || waterCodeRecord?.code || null,
        waterCodeYear: waterCodeYear || waterCodeRecord?.year || null,
        waterCodeDescription: waterCodeDescription || waterCodeRecord?.description || null,
        sellerFarmId,
        buyerWaterAccount: buyerWaterAccountRaw ? buyerWaterAccountRaw : null,
        isAuction,
        auctionEndsAt,
        reservePrice: reservePriceCents,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/listings error", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
