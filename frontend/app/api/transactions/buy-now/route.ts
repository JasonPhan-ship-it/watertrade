// app/api/transactions/buy-now/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listingId || "");
    const acreFeetReq = Number(body?.acreFeet || 0);

    if (!listingId || !Number.isFinite(acreFeetReq) || acreFeetReq <= 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Resolve the viewer to our internal User row
    const buyer = await prisma.user.findUnique({ where: { clerkId } });
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Load listing and lock **server-trusted** price
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        district: true,
        waterType: true,
        pricePerAf: true,    // cents
        acreFeet: true,      // available quantity (adjust to your schema)
        sellerId: true,      // assumes you store a seller on listing
        kind: true,
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Optional: enforce availability cap
    const maxAF = Math.max(1, Number(listing.acreFeet ?? 0));
    const acreFeet = Math.min(Math.max(1, acreFeetReq), maxAF || acreFeetReq);

    const pricePerAF = Number(listing.pricePerAf || 0); // **cents**
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }

    const totalAmount = pricePerAF * acreFeet; // cents

    // Create Transaction snapshotting critical fields
    const tx = await prisma.transaction.create({
      data: {
        type: "BUY_NOW",
        status: "PENDING", // or whatever your initial status is
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId, // if your schema includes this
        listingTitleSnapshot: listing.title,
        districtSnapshot: listing.district,   // add these if your model has them
        waterTypeSnapshot: listing.waterType, // (or omit if not)
        pricePerAF: pricePerAF,               // cents (server-trusted)
        acreFeet: acreFeet,
        totalAmount: totalAmount,             // cents
        // add any other fields your schema requires
      },
      select: { id: true },
    });

    // OPTIONAL: create a Trade tied to the Transaction if your UI expects it
    // const trade = await prisma.trade.create({
    //   data: {
    //     id: crypto.randomUUID(), // if you use TEXT IDs you can use your own generator
    //     listingId: listing.id,
    //     sellerUserId: listing.sellerId!,
    //     buyerUserId: buyer.id,
    //     district: listing.district ?? "",
    //     waterType: listing.waterType ?? null,
    //     volumeAf: acreFeet,
    //     pricePerAf: pricePerAF,
    //     status: "OFFERED",
    //     transactionId: tx.id,
    //   },
    // });

    return NextResponse.json({ id: tx.id }, { status: 201 });
  } catch (e: any) {
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
