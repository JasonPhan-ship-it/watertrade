// app/api/purchase/buy-now/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { TransactionStatus, TransactionType } from "@prisma/client"; // 👈 add this

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listingId || "");
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });

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
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    // Require seller (Option A)
    if (!listing.sellerId) {
      return NextResponse.json({ error: "Listing has no seller assigned." }, { status: 422 });
    }

    const totalCents = listing.acreFeet * listing.pricePerAF;

    const cUser = await currentUser();
    const primaryEmail: string = cUser?.emailAddresses?.[0]?.emailAddress ?? "";
    const displayName: string =
      (cUser
        ? ([cUser.firstName, cUser.lastName].filter(Boolean).join(" ") ||
           cUser.username ||
           "")
        : "");

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

    const tx = await prisma.transaction.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,                 // now guaranteed
        type: TransactionType.BUY_NOW,              // 👈 enum, not string
        status: TransactionStatus.PENDING,          // 👈 enum, not string
        acreFeet: listing.acreFeet,
        pricePerAF: listing.pricePerAF,             // cents
        totalAmount: totalCents,                    // cents
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
