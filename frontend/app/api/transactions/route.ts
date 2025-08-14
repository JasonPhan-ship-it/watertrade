// app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";
import { getOrCreateUserFromClerk } from "@/lib/clerk";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const me = await getOrCreateUserFromClerk(clerkId);

    const body = await req.json();
    const { listingId, type, acreFeet, pricePerAF } = body || {};
    if (!listingId || !acreFeet || !pricePerAF || type !== "BUY_NOW") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const qty = Math.max(1, Math.floor(Number(acreFeet)));
    const p = Math.round(Number(pricePerAF)); // cents/AF

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
    if (!listing.seller) {
      return NextResponse.json({ error: "Listing has no seller assigned" }, { status: 400 });
    }

    const totalAmount = qty * p;

    const trx = await prisma.transaction.create({
      data: {
        listingId,
        buyerId: me.id,
        sellerId: listing.sellerId!,
        type: "BUY_NOW",
        acreFeet: qty,
        pricePerAF: p,
        totalAmount,
      },
      select: { id: true },
    });

    if (listing.seller.email) {
      await sendEmail({
        to: listing.seller.email,
        subject: "Buy Now initiated on your listing",
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
            <h2>Buy Now Initiated</h2>
            <p>A buyer started a Buy Now on your listing${listing.title ? ` “${listing.title}”` : ""}.</p>
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

    return NextResponse.json({ id: trx.id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
