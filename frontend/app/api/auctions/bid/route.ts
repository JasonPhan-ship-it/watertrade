// app/api/auctions/bid/route.ts
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
    const listingId: string = body?.listingId;
    const pricePerAF: number = Number(body?.pricePerAF); // cents/AF if your UI sends cents

    if (!listingId || !Number.isFinite(pricePerAF)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        acreFeet: true,
        pricePerAF: true, // <- capital AF per your schema
        sellerId: true,
        seller: { select: { id: true, email: true, name: true } },
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.seller) {
      return NextResponse.json({ error: "Listing has no seller assigned" }, { status: 400 });
    }

    await prisma.bid.create({
      data: {
        listingId,
        bidderId: me.id,
        pricePerAF: Math.round(pricePerAF),
      },
    });

    if (listing.seller.email) {
      await sendEmail({
        to: listing.seller.email,
        subject: "New bid on your listing",
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
            <h2>New Bid Received</h2>
            <p>A buyer placed a bid on your listing${listing.title ? ` “${listing.title}”` : ""}.</p>
            <ul>
              <li>Listing ID: ${listing.id}</li>
              <li>Bid $/AF: <strong>$${(pricePerAF / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></li>
              <li>Qty (AF): ${listing.acreFeet.toLocaleString()}</li>
            </ul>
            <p><a href="${appUrl(`/listings/${listing.id}`)}" target="_blank">Review the bid</a></p>
          </div>
        `,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
