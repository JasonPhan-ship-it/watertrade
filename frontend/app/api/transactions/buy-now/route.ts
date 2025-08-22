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

    const buyer = await prisma.user.findUnique({ where: { clerkId } });
    if (!buyer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 🔧 NOTE: pricePerAF (capital AF) – this was the TypeScript error
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        district: true,
        waterType: true,
        pricePerAF: true, // ← fixed name
        // If you have these, keep them; otherwise remove them:
        // acreFeet: true,
        // sellerId: true,
        // kind: true,
      },
    });

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    // If you track available AF on listing, clamp here; otherwise just use request
    const acreFeet = Math.max(1, acreFeetReq);

    const pricePerAF = Number(listing.pricePerAF || 0); // cents (server-trusted)
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }

    const totalAmount = pricePerAF * acreFeet; // cents

    // Create the Transaction; adjust fields to your schema as needed
    const tx = await prisma.transaction.create({
      data: {
        type: "BUY_NOW",
        status: "PENDING",
        listingId: listing.id,
        buyerId: buyer.id,
        // sellerId: listing.sellerId, // ← include only if your schema has this
        listingTitleSnapshot: listing.title,
        // If your model has these snapshot fields use them; otherwise remove:
        // districtSnapshot: listing.district,
        // waterTypeSnapshot: listing.waterType,
        pricePerAF,            // cents (locked to listing)
        acreFeet,              // quantity requested
        totalAmount,           // cents
      },
      select: { id: true },
    });

    // If your UI requires a Trade row to enable actions, you can create it here.
    // Otherwise, just return the Transaction id.
    return NextResponse.json({ id: tx.id }, { status: 201 });
  } catch (e: any) {
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
