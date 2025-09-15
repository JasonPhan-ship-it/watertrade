// app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

// Include 'district' so UI sort works
type SortKey = "createdAt" | "pricePerAf" | "acreFeet" | "availabilityEnd" | "district";

const ORDER_MAP: Record<SortKey, keyof import("@prisma/client").Listing> = {
  createdAt: "createdAt",
  pricePerAf: "pricePerAF",
  acreFeet: "acreFeet",
  availabilityEnd: "availabilityEnd",
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
      // If you only want ACTIVE here, add: whereAND.push({ status: "ACTIVE" });
    } else {
      // Marketplace: show only ACTIVE and exclude my own (OPEN was causing enum error)
      whereAND.push({ status: "ACTIVE" });
      if (viewerDbUserId) whereAND.push({ NOT: { sellerId: viewerDbUserId } });
    }

    const where = whereAND.length ? { AND: whereAND } : {};

    // Paging + sorting
    const take = !q.premium ? 3 : q.pageSize;
    const skip = !q.premium ? 0 : (q.page - 1) * q.pageSize;
    const orderKey = ORDER_MAP[q.sortBy] ?? "createdAt";

    const [total, rows] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        orderBy: { [orderKey]: q.sortDir },
        skip,
        take,
        select: {
          id: true,
          district: true,
          waterType: true,
          acreFeet: true,
          pricePerAF: true,      // cents
          availabilityEnd: true, // end-only
          createdAt: true,
          status: true,
          kind: true,
          sellerId: true,        // owner id for client logic
        },
      }),
    ]);

    const listings = rows.map((r) => ({
      id: r.id,
      district: r.district,
      acreFeet: r.acreFeet,
      pricePerAf: (r.pricePerAF ?? 0) / 100, // dollars
      availabilityEnd: r.availabilityEnd?.toISOString?.() ?? null,
      waterType: r.waterType,
      createdAt: r.createdAt.toISOString(),
      ownerUserId: r.sellerId,
      status: r.status,
      kind: r.kind,
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
    const body = await req.json();

    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

    const kind: "SELL" | "BUY" =
      String(body.type || "sell").toLowerCase() === "buy" ? "BUY" : "SELL";

    const district = String(body.district || "Unknown District");
    const waterType = String(body.waterType || "Surface");
    const acreFeet = Math.max(0, Math.floor(Number(body.volumeAF ?? 0)));
    const pricePerAfCents = Math.max(0, Math.round(Number(body.pricePerAF ?? 0) * 100));

    const availabilityEnd = body.availabilityEnd
      ? new Date(body.availabilityEnd)
      : new Date(Date.now() + 60 * 24 * 3600 * 1000);

    const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
    const availability = `Through ${mm(availabilityEnd)} ${availabilityEnd.getFullYear()}`;

    let sellerId: string | null = null;
    if (clerkId) {
      const user = await prisma.user.findUnique({ where: { clerkId } });
      sellerId = user?.id ?? null;
    }

    const created = await prisma.listing.create({
      data: {
        title,
        description: body.description ? String(body.description) : null,
        district,
        waterType,
        availability,
        availabilityEnd,
        acreFeet,
        pricePerAF: pricePerAfCents,
        kind,
        status: "ACTIVE",
        sellerId,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
