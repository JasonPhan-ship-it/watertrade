import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

type Query = {
  premium: boolean;
  page: number;
  pageSize: number;
  sortBy: "createdAt" | "pricePerAf" | "acreFeet" | "availabilityStart" | "availabilityEnd";
  sortDir: "asc" | "desc";
  district?: string;
  waterType?: string;
};

function parseQuery(req: NextRequest): Query {
  const sp = new URL(req.url).searchParams;
  return {
    premium: (sp.get("premium") ?? "false") === "true",
    page: Math.max(1, parseInt(sp.get("page") ?? "1", 10)),
    pageSize: Math.min(50, Math.max(1, parseInt(sp.get("pageSize") ?? "10", 10))),
    sortBy: (sp.get("sortBy") ?? "createdAt") as Query["sortBy"],
    sortDir: (sp.get("sortDir") ?? "desc") === "asc" ? "asc" : "desc",
    district: sp.get("district") ?? undefined,
    waterType: sp.get("waterType") ?? undefined,
  };
}

// GET /api/listings
export async function GET(req: NextRequest) {
  const { premium, page, pageSize, sortBy, sortDir, district, waterType } = parseQuery(req);

  const where: any = {};
  if (district) where.district = district;
  if (waterType) where.waterType = waterType;

  // If not premium, we’ll limit to 3 newest for your public preview
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
        acreFeet: true,
        pricePerAf: true,
        availabilityStart: true,
        availabilityEnd: true,
        waterType: true,
        createdAt: true,
      },
    }),
  ]);

  // Format to match your homepage table types (numbers instead of Prisma.Decimal)
  const listings = rows.map((r) => ({
    id: r.id,
    district: r.district,
    acreFeet: Number(r.acreFeet),
    pricePerAf: Number(r.pricePerAf),
    availabilityStart: r.availabilityStart.toISOString().slice(0, 10),
    availabilityEnd: r.availabilityEnd.toISOString().slice(0, 10),
    waterType: r.waterType,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ listings, total, limited: !premium }, { status: 200 });
}

// POST /api/listings
export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const title: string = body.title;
    const type: string = body.type; // "sell" | "buy"
    if (!title || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Minimal defaults if your form doesn’t collect these yet
    const district = String(body.district || "Unknown District");
    const waterType = String(body.waterType || "Surface");
    const acreFeet = Number(body.volumeAF ?? 0);
    const pricePerAf = Number(body.pricePerAF ?? 0);

    // If your form doesn’t yet have dates, set a sane window
    const availabilityStart = body.availabilityStart
      ? new Date(body.availabilityStart)
      : new Date();
    const availabilityEnd = body.availabilityEnd
      ? new Date(body.availabilityEnd)
      : new Date(Date.now() + 60 * 24 * 3600 * 1000); // +60 days

    const created = await prisma.listing.create({
      data: {
        ownerId: userId ?? null,
        title,
        description: body.description ?? null,
        district,
        waterType,
        acreFeet,
        pricePerAf,
        availabilityStart,
        availabilityEnd,
        type,
      },
      select: {
        id: true,
        district: true,
        acreFeet: true,
        pricePerAf: true,
        availabilityStart: true,
        availabilityEnd: true,
        waterType: true,
        createdAt: true,
      },
    });

    // Format response to table shape
    return NextResponse.json(
      {
        listing: {
          ...created,
          acreFeet: Number(created.acreFeet),
          pricePerAf: Number(created.pricePerAf),
          availabilityStart: created.availabilityStart.toISOString().slice(0, 10),
          availabilityEnd: created.availabilityEnd.toISOString().slice(0, 10),
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
