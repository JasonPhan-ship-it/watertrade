// app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

type SortKey = "createdAt" | "pricePerAf" | "acreFeet" | "availabilityStart" | "availabilityEnd";

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
  };
}

function toAvailString(start: Date, end: Date) {
  const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
  return start.getFullYear() === end.getFullYear()
    ? `${mm(start)}–${mm(end)} ${start.getFullYear()}`
    : `${mm(start)} ${start.getFullYear()}–${mm(end)} ${end.getFullYear()}`;
}

// ---------- GET ----------
export async function GET(req: NextRequest) {
  const { premium, page, pageSize, sortBy, sortDir, district, waterType } = parseQuery(req);

  const where: any = { status: "ACTIVE" };
  if (district) where.district = district;
  if (waterType) where.waterType = waterType;

  const limitForFree = !premium ? 3 : pageSize;
  const skipForFree = !premium ? 0 : (page - 1) * pageSize;

  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: skipForFree,
      take: limitForFree,
      select: {
        id: true,
        district: true,
        waterType: true,
        acreFeet: true,
        pricePerAF: true,         // cents
        availabilityStart: true,
        availabilityEnd: true,
        createdAt: true,
      },
    }),
  ]);

  const listings = rows.map((r) => ({
    id: r.id,
    district: r.district,
    acreFeet: r.acreFeet,
    pricePerAf: Math.round(r.pricePerAF / 100), // dollars for UI
    availabilityStart: r.availabilityStart.toISOString(),
    availabilityEnd: r.availabilityEnd.toISOString(),
    waterType: r.waterType,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ listings, total, limited: !premium }, { status: 200 });
}

// ---------- POST ----------
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = auth();
    const body = await req.json();

    const title: string = body.title;
    const kind: "SELL" | "BUY" = (String(body.type || "sell").toUpperCase() === "BUY" ? "BUY" : "SELL");
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    // Defaults / coercions
    const district = String(body.district || "Unknown District");
    const waterType = String(body.waterType || "Surface");
    const acreFeet = Math.max(0, Math.floor(Number(body.volumeAF ?? 0)));
    const pricePerAfCents = Math.max(0, Math.round(Number(body.pricePerAF ?? 0) * 100));

    const availabilityStart = body.availabilityStart ? new Date(body.availabilityStart) : new Date();
    const availabilityEnd = body.availabilityEnd
      ? new Date(body.availabilityEnd)
      : new Date(Date.now() + 60 * 24 * 3600 * 1000); // +60 days
    const availability = toAvailString(availabilityStart, availabilityEnd);

    // Try to attach seller if we can map Clerk -> User
    let sellerId: string | null = null;
    if (clerkId) {
      const user = await prisma.user.findUnique({ where: { clerkId } });
      sellerId = user?.id ?? null;
      // (Optional) auto-upsert by email if you want to create User rows on the fly
    }

    const created = await prisma.listing.create({
      data: {
        title,
        description: body.description ?? null,
        district,
        waterType,
        availability,
        availabilityStart,
        availabilityEnd,
        acreFeet,
        pricePerAF: pricePerAfCents,
        kind,
        status: "ACTIVE",
        sellerId,
      },
      select: {
        id: true,
        district: true,
        waterType: true,
        acreFeet: true,
        pricePerAF: true,
        availabilityStart: true,
        availabilityEnd: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        listing: {
          id: created.id,
          district: created.district,
          acreFeet: created.acreFeet,
          pricePerAf: Math.round(created.pricePerAF / 100),
          availabilityStart: created.availabilityStart.toISOString(),
          availabilityEnd: created.availabilityEnd.toISOString(),
          waterType: created.waterType,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
