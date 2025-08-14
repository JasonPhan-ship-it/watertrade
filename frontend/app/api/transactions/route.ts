// app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";
import { getOrCreateUserFromClerk } from "@/lib/clerk";

export const runtime = "nodejs";

type TType = "BUY_NOW" | "OFFER";

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// If UI sends dollars, we upconvert to cents. If already cents (e.g., 65000), keep it.
function dollarsToCentsMaybe(v: number): number {
  return v < 10_000 ? Math.round(v * 100) : v;
}

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const me = await getOrCreateUserFromClerk(clerkId);

    const body = await req.json();

    const listingId = String(body?.listingId || "");
    const rawType: string = String(body?.type || "");
    const type = (rawType.toUpperCase() as TType) || null;

    // numbers may come as strings
    const qty = toInt(body?.acreFeet);
    let p = toInt(body?.pricePerAF);

    // Validate payload
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    if (type !== "BUY_NOW" && type !== "OFFER") {
      return NextResponse.json({ error: 'type must be "BUY_NOW" or "OFFER"' }, { status: 400 });
    }
    if (!qty || qty < 1) {
      return NextResponse.json({ error: "acreFeet must be a positive integer" }, { status: 400 });
    }
    if (!p || p < 1) {
      return NextResponse.json({ error: "pricePerAF must be a positive number (cents or dollars)" }, { status: 400 });
    }

    // Convert dollars -> cents if it looks like dollars
    p = dollarsToCentsMaybe(p);
    const totalAmount = qty * p; // cents

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        seller: { select: { id: true, email: true, name: true } },
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId || !listing.seller) {
      return NextResponse.json({ error: "Listing has no seller assigned" }, { status: 400 });
    }

    // Create the transaction (both BUY_NOW and OFFER use same table in your schema)
    const trx = await prisma.transaction.create({
      data: {
        listingId,
        buyerId: me.id,
        sellerId: listing.sellerId,
        type,                 // "BUY_NOW" | "OFFER"
        acreFeet: qty,
        pricePerAF: p,        // cents
        totalAmount,          // cents
        // status defaults to INITIATED
        // You can set offerExpiresAt for OFFER if you add it in UI/payload later
        listingTitleSnapshot: listing.title ?? null,
        buyerNameSnapshot: me.name ?? null,
        buyerEmailSnapshot: me.email ?? null,
        sellerNameSnapshot: listing.seller.name ?? null,
        sellerEmailSnapshot: listing.seller.email ?? null,
      },
      select: { id: true, type: true },
    });

    // Email seller
    if (listing.seller.email) {
      const isOffer = type === "OFFER";
      await sendEmail({
        to: listing.seller.email,
        subject: isOffer ? "Offer received on your listing" : "Buy Now initiated on your listing",
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
            <h2>${isOffer ? "Offer Received" : "Buy Now Initiated"}</h2>
            <p>A buyer ${isOffer ? "submitted an offer" : "started a Buy Now"} on your listing${listing.title ? ` “${listing.title}”` : ""}.</p>
            <ul>
              <li>Transaction ID: ${trx.id}</li>
              <li>Qty (AF): ${qty.toLocaleString()}</li>
              <li>Price $/AF: $${(p / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</li>
              <li>Total: $${(totalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</li>
            </ul>
            <p><a href="${appUrl(`/transactions/${trx.id}`)}" target="_blank">Open transaction</a></p>
          </div>
        `,
      });
    }

    return NextResponse.json({ id: trx.id, type: trx.type });
  } catch (err: any) {
    console.error("POST /api/transactions error:", err);
    // Try to surface a useful message
    const msg =
      typeof err?.message === "string" && err.message.length < 500
        ? err.message
        : "Failed to create transaction";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
