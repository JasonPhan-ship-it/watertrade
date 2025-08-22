// app/api/transactions/buy-now/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // ---- Auth
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ---- Parse body
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      listingId?: string;
      acreFeet?: number;
    };

    const listingId = (body.listingId || "").trim();
    const acreFeetReq = Number(body.acreFeet ?? 0);

    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    if (!Number.isFinite(acreFeetReq) || acreFeetReq <= 0) {
      return NextResponse.json({ error: "acreFeet must be a positive number" }, { status: 400 });
    }

    // Whole AF (adjust if you support fractional)
    const acreFeet = Math.max(1, Math.floor(acreFeetReq));

    // ---- Resolve buyer user
    const buyer = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
    if (!buyer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ---- Load listing (server‑trusted price + seller)
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        district: true,   // remove if not in your model
        waterType: true,  // remove if not in your model
        pricePerAF: true, // cents
        sellerId: true,   // REQUIRED to satisfy Transaction.sellerId
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId) {
      return NextResponse.json({ error: "Listing is missing sellerId" }, { status: 400 });
    }

    const pricePerAF = Number(listing.pricePerAF || 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }

    const totalAmount = pricePerAF * acreFeet; // cents

    // ---- Create Transaction (enum‑safe)
    const tx = await prisma.transaction.create({
      data: {
        type: Prisma.TransactionType.BUY_NOW,
        status: Prisma.TransactionStatus.PENDING, // or omit if you have a DB default
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,          // ✅ FIX: required by your schema
        listingTitleSnapshot: listing.title, // keep if column exists

        // If these snapshot columns don't exist, delete them:
        // districtSnapshot: listing.district,
        // waterTypeSnapshot: listing.waterType,

        pricePerAF,     // cents
        acreFeet,       // quantity
        totalAmount,    // cents
      },
      select: { id: true },
    });

    // Optional: also create a Trade row if your UI expects it
    // try {
    //   await prisma.trade.create({
    //     data: {
    //       id: crypto.randomUUID(),
    //       listingId: listing.id,
    //       sellerUserId: listing.sellerId,
    //       buyerUserId: buyer.id,
    //       district: listing.district ?? "",
    //       waterType: listing.waterType ?? null,
    //       volumeAf: acreFeet,
    //       pricePerAf: pricePerAF,
    //       status: "OFFERED",
    //       transactionId: tx.id,
    //     },
    //   });
    // } catch (e: any) {
    //   if (e?.code !== "P2021") console.warn("[buy-now] trade create skipped:", e?.message || e);
    // }

    const res = NextResponse.json({ id: tx.id }, { status: 201 });
    res.headers.set("Location", `/transactions/${tx.id}?action=review`);
    return res;
  } catch (e: any) {
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
