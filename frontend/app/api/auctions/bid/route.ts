// app/api/auctions/bid/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sendEmail, appUrl } from "@/lib/email";
import { getOrCreateUserFromClerk } from "@/lib/clerk";
import { dollarsToCents, placeAuctionBid } from "@/lib/bids";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const me = await getOrCreateUserFromClerk(clerkId);

    const body = await req.json().catch(() => ({}));
    const listingId: string = body?.listingId;
    const pricePerAFCents =
      typeof body.pricePerAFCents === "number" && Number.isFinite(body.pricePerAFCents)
        ? Math.round(body.pricePerAFCents)
        : dollarsToCents(body.pricePerAF);
    
    if (!listingId || pricePerAFCents == null || pricePerAFCents <= 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const result = await placeAuctionBid({
      listingId,
      bidderId: me.id,
      pricePerAFCents,
      includeSeller: true,
    });
    if ("error" in result) {
      const { error, status, minCents } = result;
      return NextResponse.json({ error, ...(minCents ? { minCents } : {}) }, { status });
    }

    if (result.listing.seller?.email) {
      await sendEmail({
        to: result.listing.seller.email,
        subject: "New bid on your listing",
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
            <h2>New Bid Received</h2>
            <p>A buyer placed a bid on your listing${result.listing.title ? ` “${result.listing.title}”` : ""}.</p>
            <ul>
              <li>Listing ID: ${result.listing.id}</li>
              <li>Bid $/AF: <strong>$${(pricePerAFCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></li>
              <li>Qty (AF): ${(result.listing.acreFeet ?? 0).toLocaleString()}</li>
            </ul>
            <p><a href="${appUrl(`/listings/${result.listing.id}`)}" target="_blank">Review the bid</a></p>
          </div>
        `,
      });
    }

    return NextResponse.json({
      ok: true,
      bid: result.bid,
      highestBidCents: result.highestBidCents,
      meetsReserve: result.meetsReserve,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
