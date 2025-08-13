// app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";

// --- Replace this SEED once you hook up Prisma ---
type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string;
  availabilityEnd: string;
  waterType: string;
  createdAt: string;
};

// Simple in-memory seed for preview (stateless on Serverless)
const SEED: Listing[] = [
  {
    id: "1",
    district: "Westlands WD",
    acreFeet: 50,
    pricePerAf: 450,
    availabilityStart: "2025-09-01",
    availabilityEnd: "2025-12-31",
    waterType: "Surface",
    createdAt: "2025-08-01T10:00:00Z",
  },
  {
    id: "2",
    district: "Kern-Tulare WD",
    acreFeet: 30,
    pricePerAf: 420,
    availabilityStart: "2025-08-20",
    availabilityEnd: "2025-11-15",
    waterType: "Transfer",
    createdAt: "2025-08-08T15:30:00Z",
  },
  {
    id: "3",
    district: "Fresno ID",
    acreFeet: 80,
    pricePerAf: 400,
    availabilityStart: "2025-09-10",
    availabilityEnd: "2026-01-31",
    waterType: "Groundwater",
    createdAt: "2025-08-10T09:12:00Z",
  },
  {
    id: "4",
    district: "Madera ID",
    acreFeet: 25,
    pricePerAf: 480,
    availabilityStart: "2025-08-25",
    availabilityEnd: "2025-10-30",
    waterType: "Surface",
    createdAt: "2025-08-12T18:45:00Z",
  },
];

// --- GET /api/listings ---
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams;

  const premium = (search.get("premium") ?? "false") === "true";
  const page = Math.max(1, parseInt(search.get("page") ?? "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(search.get("pageSize") ?? "10", 10)));
  const sortBy = (search.get("sortBy") ?? "createdAt") as keyof Listing;
  const sortDir = (search.get("sortDir") ?? "desc") === "asc" ? "asc" : "desc";

  // sort
  const sorted = [...SEED].sort((a, b) => {
    const av = a[sortBy] as any;
    const bv = b[sortBy] as any;
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // If not premium, limit results (your homepage expects 3 rows)
  const all = premium ? sorted : sorted.slice(0, 3);
  const total = sorted.length;

  // paginate (on the subset for demo)
  const start = (page - 1) * pageSize;
  const listings = all.slice(start, start + pageSize);

  return NextResponse.json({ listings, total, limited: !premium }, { status: 200 });
}

// --- POST /api/listings ---
export async function POST(req: NextRequest) {
  try {
    const { title, description, volumeAF, pricePerAF, type } = await req.json();

    if (!title || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Map the “create listing” payload to your Listing type.
    // In real code, insert via Prisma and return the DB row.
    const created: Listing = {
      id: crypto.randomUUID(),
      district: "Unknown District", // TODO: include in form and map here
      acreFeet: Number(volumeAF) || 0,
      pricePerAf: Number(pricePerAF) || 0,
      availabilityStart: new Date().toISOString(), // TODO: capture from form
      availabilityEnd: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(), // +60 days as placeholder
      waterType: type === "sell" ? "Surface" : "Buy", // placeholder mapping
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ listing: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
