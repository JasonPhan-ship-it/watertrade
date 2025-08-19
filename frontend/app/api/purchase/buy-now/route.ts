// app/api/purchase/buy-now/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { listingId } = await req.json();
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });

    // 1) Re-read listing from DB to guarantee server-truth numbers
    const listing = await prisma.listing.findUnique({
      where: { id: String(listingId) },
      select: {
        id: true,
        title: true,
        acreFeet: true,
        pricePerAF: true, // cents
        sellerId: true,   // assumes you store seller's User.id here
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const { acreFeet, pricePerAF } = listing; // cents
    const totalCents = acreFeet * pricePerAF;

    // 2) Ensure buyer exists in your local User table (by Clerk ID)
    const cUser = await currentUser();
    const buyer = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        email: cUser?.emailAddresses?.[0]?.emailAddress ?? undefined,
        name: cUser ? [cUser.firstName, cUser.lastName].filter(Boolean).join(" ") || cUser.username || null : undefined,
      },
      create: {
        clerkId: userId,
        email: cUser?.emailAddresses?.[0]?.emailAddress ?? null,
        name: cUser ? [cUser.firstName, cUser.lastName].filter(Boolean).join(" ") || cUser.username || null : null,
      },
      select: { id: true },
    });

    // 3) Create a Transaction (matches your admin transactions view)
    const tx = await prisma.transaction.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,        // must exist on Listing
        type: "BUY_NOW",                   // enum/string in your schema
        status: "PENDING",                 // enum/string in your schema
        acreFeet: listing.acreFeet,
        pricePerAF: listing.pricePerAF,    // cents
        totalAmount: totalCents,           // cents
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
