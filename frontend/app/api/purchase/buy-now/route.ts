// app/api/purchase/buy-now/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";

// Ensure Node runtime + dynamic so we can use Prisma safely
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listingId || "");
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    // Re-read listing from DB (server-truth)
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        acreFeet: true,
        pricePerAF: true, // cents
        sellerId: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const { acreFeet, pricePerAF } = listing; // cents
    const totalCents = acreFeet * pricePerAF;

    // Get Clerk user INSIDE handler (no top-level await)
    const cUser = await currentUser();

    // Build safe strings (avoid nulls if your Prisma fields are non-nullable)
    const primaryEmail: string = cUser?.emailAddresses?.[0]?.emailAddress ?? "";
    const displayName: string =
      (cUser
        ? ([cUser.firstName, cUser.lastName].filter(Boolean).join(" ") ||
           cUser.username ||
           "")
        : "");

    // Upsert buyer in your local User table
    const buyer = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        email: primaryEmail || undefined,
        name: displayName || undefined,
      },
      create: {
        clerkId: userId,
        email: primaryEmail, // string (not null)
        name: displayName,   // string (not null if schema requires)
      },
      select: { id: true },
    });

    // Create a Transaction (align names/enums with your schema)
    const tx = await prisma.transaction.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        type: "BUY_NOW",                // adjust if your enum uses a different value
        status: "PENDING",              // adjust to your enum/string
        acreFeet: listing.acreFeet,
        pricePerAF: listing.pricePerAF, // cents
        totalAmount: totalCents,        // cents
        listingTitleSnapshot: listing.title ?? null,
      },
      select: { id: true },
    });

    return NextResponse.json({ transactionId: tx.id }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
