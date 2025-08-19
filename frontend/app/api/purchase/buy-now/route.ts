import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId } = await req.json();

    // Re-read listing from DB to ensure values match DB (ignore client numbers)
    const listing = await prisma.listing.findUnique({
      where: { id: String(listingId) },
      select: { id: true, acreFeet: true, pricePerAF: true, sellerId: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Compute on server using DB-truth values
    const { acreFeet, pricePerAF } = listing; // pricePerAF is cents
    const totalCents = acreFeet * pricePerAF;

    // Example: create an order record (adjust to your schema)
    const order = await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerClerkId: userId,
        acreFeet,
        pricePerAF,      // cents
        totalAmount: totalCents, // cents
        status: "PENDING",
      },
      select: { id: true },
    });

    return NextResponse.json({ orderId: order.id }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
