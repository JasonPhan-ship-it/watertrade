// app/api/listings/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const row = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      district: true,
      waterType: true,
      availability: true,
      availabilityStart: true,
      availabilityEnd: true,
      acreFeet: true,
      pricePerAF: true,
      kind: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Normalize to UI-friendly JSON (dollars, ISO strings)
  const json = {
    ...row,
    pricePerAf: Math.round((row.pricePerAF / 100) * 100) / 100,
    pricePerAF: undefined, // hide raw cents field
    availabilityStart: row.availabilityStart.toISOString(),
    availabilityEnd: row.availabilityEnd.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  return NextResponse.json(json, { status: 200 });
}
