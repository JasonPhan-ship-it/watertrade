// app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

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
    if (clerkUserId) {
      const viewer = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
        select: { id: true },
      });
      viewerDbUserId = viewer?.id ?? null;
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
          sellerId: true, // owner id for client logic
        },
      }),
    ]);

    const listings = rows.map((r) => ({
      id: r.id,
      district: r.district,
      acreFeet: r.acreFeet,
      pricePerAf: (r.pricePerAF ?? 0) / 100, // dollars
      // Field kept for backward compat even though DB has only "availability" (string)
      availabilityEnd: null as string | null,
      waterType: r.waterType,
      createdAt: r.createdAt.toISOString(),
      ownerUserId: r.sellerId,
      status: r.status,
      kind: r.kind,
      availability: r.availability,
    }));

    return noCache(NextResponse.json({ listings, total, limited: !q.premium }, { status: 200 }));
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

    // acre-feet – accept acreFeet or volumeAF
    const acreFeet = Math.max(0, Math.floor(Number(body.acreFeet ?? body.volumeAF ?? 0)));

    // price per AF – dollars (required, > 0)
    const rawPrice = Number(body.pricePerAF);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      return NextResponse.json({ error: "Price per AF must be greater than 0" }, { status: 400 });
    }
    const pricePerAfCents = Math.round(rawPrice * 100);

    // Compose an "availability" label (DB only stores the string today)
    const fallbackEnd = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    const availabilityEndInput = body.availabilityEnd ? new Date(body.availabilityEnd) : fallbackEnd;
    const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
    const availability = `Through ${mm(availabilityEndInput)} ${availabilityEndInput.getFullYear()}`;

    const created = await prisma.listing.create({
      data: {
        title,
        description: body.description ? String(body.description) : null, // optional
        district,
        waterType,
        availability, // string only (no availabilityEnd column in DB)
        acreFeet,
        pricePerAF: pricePerAfCents, // cents
        kind,
        status: "ACTIVE",
        sellerId: me.id,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/listings error", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
