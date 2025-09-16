// app/api/listings/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server"; // ⬅️ added

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
      // availabilityStart: true,
      // availabilityEnd: true,
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
    // availabilityStart: row.availabilityStart.toISOString(),
    // availabilityEnd: row.availabilityEnd.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  return NextResponse.json(json, { status: 200 });
}

/* --- NEW: DELETE listing (owner or admin only) --- */
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch listing owner
    const listing = await prisma.listing.findUnique({
      where: { id: params.id },
      select: { id: true, sellerId: true },
    });
    if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Resolve current user's DB row
    const me = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, role: true },
    });
    if (!me) return NextResponse.json({ error: "Account not provisioned" }, { status: 403 });

    const isOwner = me.id === listing.sellerId;
    const isAdmin = me.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.listing.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/listings/[id] error", err);
    return NextResponse.json({ error: "Failed to delete listing" }, { status: 500 });
  }
}
