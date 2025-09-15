// app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

type SortKey = "createdAt" | "pricePerAf" | "acreFeet" | "availabilityEnd";

const ORDER_MAP: Record<SortKey, keyof import("@prisma/client").Listing> = {
  createdAt: "createdAt",
  pricePerAf: "pricePerAF",
  acreFeet: "acreFeet",
  availabilityEnd: "availabilityEnd",
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

    // Who’s viewing? (Clerk -> DB user)
    const { userId: clerkUserId } = auth();
    let viewerDbUserId: string | null = null;
    if (clerkUserId) {
      const viewer = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
        select: { id: true },
      });
      viewerDbUserId = viewer?.id ?? null;
    }

    // Base filters
    const whereAND: any[] = [];

    if (q.district && q.district !== "All Districts") whereAND.push({ district: q.district });
    if (q.waterType && q.waterType !== "Any Water Type") whereAND.push({ waterType: q.waterType });

    // Scope logic
    // Build an OR over likely owner fields (adjust to your schema as needed)
    const ownerOR = viewerDbUserId
      ? [
          { sellerId: viewerDbUserId },        // your POST writes this
          { sellerUserId: viewerDbUserId },    // common variant
          { userId: viewerDbUserId },          // generic owner
          { createdByUserId: viewerDbUserId }, // some schemas
          { ownerId: viewerDbUserId },         // fallback
        ]
      : [];

    const scope = q.scope || (q.mineFlag ? "mine" : q.excludeMineFlag ? "market" : "market");

    if (scope === "mine") {
      // Not signed in → nothing to show
      if (!viewerDbUserId) {
        return noCache(NextResponse.json({ listings: [], total: 0, limited: !q.premium }));
      }
      whereAND.push({ OR: ownerOR });
      // Show all statuses for "Your Listings" so users can manage drafts/closed/etc.
      // If you only want ACTIVE here, uncomment next line:
      // whereAND.push({ status: "ACTIVE" });
    } else {
      // Marketplace: show ACTIVE (or OPEN) listings from other users
      whereAND.push({ status: { in: ["ACTIVE", "OPEN"] } });
      if (viewerDbUserId) {
        whereAND.push({ NOT: { OR: ownerOR } });
      }
    }

    const where = whereAND.length ? { AND: whereAND } : {};

    // premium gating (optional, as in your original code)
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
          availabilityEnd: true, // keep end only
          createdAt: true,

          // owner fields (so client can reason if needed)
          sellerId: true as any,
          sellerUserId: true as any,
          userId: true as any,
          createdByUserId: true as any,
          ownerId: true as any,
          status: true,
          kind: true,
        },
      }),
    ]);

    const listings = rows.map((r) => {
      const ownerUserId =
        (r as any).sellerId ||
        (r as any).sellerUserId ||
        (r as any).userId ||
        (r as any).createdByUserId ||
        (r as any).ownerId ||
        null;

      return {
        id: r.id,
        district: r.district,
        acreFeet: r.acreFeet,
        pricePerAf: (r.pricePerAF ?? 0) / 100, // dollars for your UI table
        availabilityEnd: r.availabilityEnd?.toISOString?.() ?? null,
        waterType: r.waterType,
        createdAt: r.createdAt.toISOString(),
        ownerUserId,
        status: r.status,
        kind: r.kind,
      };
    });

    return noCache(NextResponse.json({ listings, total, limited: !q.premium }, { status: 200 }));
  } catch (err: any) {
    console.error("[api/listings] error", err);
    return noCache(NextResponse.json({ listings: [], total: 0, error: err?.message || "Internal error" }, { status: 500 }));
  }
}

// ---------- POST (unchanged except for availabilityStart still written if your DB has it) ----------
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

    const availabilityStart = body.availabilityStart ? new Date(body.availabilityStart) : new Date();
    const availabilityEnd = body.availabilityEnd
      ? new Date(body.availabilityEnd)
      : new Date(Date.now() + 60 * 24 * 3600 * 1000); // +60 days

    const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
    const availability =
      availabilityStart.getFullYear() === availabilityEnd.getFullYear()
        ? `${mm(availabilityStart)}–${mm(availabilityEnd)} ${availabilityStart.getFullYear()}`
        : `${mm(availabilityStart)} ${availabilityStart.getFullYear()}–${mm(availabilityEnd)} ${availabilityEnd.getFullYear()}`;

    // Link to current DB user
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
        availabilityStart, // remove if the column is gone
        availabilityEnd,
        acreFeet,
        pricePerAF: pricePerAfCents,
        kind,
        status: "ACTIVE",
        sellerId, // ownership!
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
