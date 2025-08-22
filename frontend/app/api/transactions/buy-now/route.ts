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

    // ---- Parse + validate body
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

    // Round down to whole AF (adjust if you support fractional AF)
    const acreFeet = Math.max(1, Math.floor(acreFeetReq));

    // ---- Resolve viewer to internal User
    const buyer = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
    if (!buyer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ---- Load listing; lock price from DB (in cents)
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        district: true,   // if these don't exist in your model, remove them
        waterType: true,  // ^
        pricePerAF: true, // cents
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const pricePerAF = Number(listing.pricePerAF || 0);
    if (!Number.isFinite(pricePerAF) || pricePerAF <= 0) {
      return NextResponse.json({ error: "Listing has invalid price" }, { status: 400 });
    }

    const totalAmount = pricePerAF * acreFeet; // cents

    // ---- Create Transaction (snapshot key fields)
    const tx = await prisma.transaction.create({
      data: {
        // Use Prisma enums so TS matches your schema; if enum names differ,
        // use your IDE autocomplete after "Prisma." to pick the correct ones.
        type: Prisma.TransactionType.BUY_NOW,
        status: Prisma.TransactionStatus.PENDING,
        listingId: listing.id,
        buyerId: buyer.id,
        listingTitleSnapshot: listing.title,
        // If your Transaction model has these snapshot columns, keep them;
        // otherwise delete them.
        // districtSnapshot: listing.district,
        // waterTypeSnapshot: listing.waterType,

        pricePerAF,   // cents (server-trusted)
        acreFeet,     // quantity
        totalAmount,  // cents
      },
      select: { id: true },
    });

    // Optional: create a Trade tied to this Transaction if your UI requires it.
    // We wrap in try/catch so missing Trade table won't crash the endpoint.
    /*
    try {
      await prisma.trade.create({
        data: {
          id: crypto.randomUUID(),
          listingId: listing.id,
          sellerUserId: "<SELLER_ID_HERE>", // if you have it on Listing
          buyerUserId: buyer.id,
          district: listing.district ?? "",
          waterType: listing.waterType ?? null,
          volumeAf: acreFeet,
          pricePerAf: pricePerAF,
          status: "OFFERED",
          transactionId: tx.id,
        },
      });
    } catch (e: any) {
      if (e?.code !== "P2021") {
        console.warn("[buy-now] trade create skipped:", e?.message || e);
      }
    }
    */

    // 201 + Location header so callers can redirect without parsing JSON
    const res = NextResponse.json({ id: tx.id }, { status: 201 });
    res.headers.set("Location", `/transactions/${tx.id}?action=review`);
    return res;
  } catch (e: any) {
    console.error("[buy-now] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
