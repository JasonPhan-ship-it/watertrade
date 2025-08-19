// app/api/purchase/buy-now/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";

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

    // 1) Re-read listing from DB (server-truth)
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        acreFeet: true,
        pricePerAF: true, // cents
        sellerId: true,   // must be present (Option A)
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Option A: require a seller
    if (!listing.sellerId) {
      return NextResponse.json(
        { error: "Listing has no seller assigned." },
        { status: 422 }
      );
    }

    const { acreFeet, pricePerAF } = listing; // cents
    const totalCents = acreFeet * pricePerAF;

    // 2) Get Clerk user INSIDE handler (no top-level await)
    const cUser = await currentUser();

    // Safe strings to satisfy non-nullable Prisma fields
    const primaryEmail: string = cUser?.emailAddresses?.[0]?.emailAddress ?? "";
    const displayName: string =
      (cUser
        ? ([cUser.firstName, cUser.lastName].filter(Boolean).join(" ") ||
           cUser.username ||
           "")
        : "");

    // 3) Upsert buyer in local User table by Clerk ID
    const buyer = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        email: primaryEmail || undefined,
        name: displayName || undefined,
      },
      create: {
        clerkId: userId,
        email: primaryEmail,
        name: displayName,
      },
      select: { id: true },
    });

    // 4) Create Transaction (sellerId now guaranteed to be string)
    const tx = await prisma.transaction.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,     // required and present
        type: "BUY_NOW",
        status: "PENDING",
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
