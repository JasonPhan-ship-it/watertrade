// app/api/listings/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { title, description, volumeAF, pricePerAF, type } = await req.json();

  if (!title || !type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // TODO: persist to DB here
  const id = crypto.randomUUID();
  const created = {
    id,
    title,
    description: description ?? "",
    volumeAF: Number(volumeAF) || 0,
    pricePerAF: Number(pricePerAF) || 0,
    type, // "buy" | "sell"
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json({ listing: created }, { status: 201 });
}
