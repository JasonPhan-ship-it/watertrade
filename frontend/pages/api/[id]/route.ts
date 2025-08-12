// frontend/app/api/listings/[id]/route.ts
import { NextResponse } from "next/server";

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

type ApiResponse = {
  listings: Listing[];
  total: number;
  limited?: boolean;
};

export async function GET(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = decodeURIComponent(ctx.params.id);

    // Build absolute URL to your existing list API
    const url = new URL(req.url);
    const base = `${url.protocol}//${url.host}`;

    // Fetch a big page so the id is included
    const listRes = await fetch(
      `${base}/api/listings?premium=true&page=1&pageSize=1000&sortBy=createdAt&sortDir=desc`,
      { cache: "no-store" }
    );

    if (!listRes.ok) {
      const text = await listRes.text();
      return NextResponse.json({ error: `Upstream /api/listings failed: ${text}` }, { status: 502 });
    }

    const data = (await listRes.json()) as ApiResponse;
    const match = (data.listings || []).find((l) => String(l.id) === id);

    if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(match);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
