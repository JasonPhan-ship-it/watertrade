// app/api/transactions/buy-now/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@prisma/client"; // ✅ named enums

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
    }
    const body = (await req.json().catch(() => ({}))) as { listingId?: string; acreFeet?: number };

    const listingId = (body.listingId || "").trim();
    const acreFeetReq = Number(body.acreFeet ?? 0);
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    if (!Number.isFinite(acreFeetReq) || acreFeetReq <= 0) {
      return NextResponse.json({ error: "acreFeet must be a positive number" }, { status: 400 });
    }
    const acreFeet = Math.max(1, Math.floor(acreFeetReq));

    const buyer = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
    if (!buyer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        district: true,    // remove if not in your model
        waterType: true,   // remove if not in your model
        pricePerAF: true,  // cents
        sellerId: true,    // required by Transaction.sellerId
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId) return NextResponse.json({ error: "Listing is missing sellerId" }, { status: 400 });

    const pricePerAF = Number(listing.pricePerAF || 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }
    const totalAmount = pricePerAF * acreFeet;

    const tx = await prisma.transaction.create({
      data: {
        type: TransactionType.BUY_NOW,          // ✅ use enum
        status: TransactionStatus.PENDING,      // ✅ use enum (or omit if DB default)
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        listingTitleSnapshot: listing.title,
        // districtSnapshot: listing.district,   // keep only if column exists
        // waterTypeSnapshot: listing.waterType, // keep only if column exists
        pricePerAF,
        acreFeet,
        totalAmount,
      },
      select: { id: true },
    });

    const res = NextResponse.json({ id: tx.id }, { status: 201 });
    res.headers.set("Location", `/transactions/${tx.id}?action=review`);
    return res;
  } catch (e: any) {
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
