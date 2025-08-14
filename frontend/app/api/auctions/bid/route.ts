import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma"; // your prisma client
import { sendEmail, appUrl } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const listingId: string = body?.listingId;
    const pricePerAF: number = Number(body?.pricePerAF);

    if (!listingId || !Number.isFinite(pricePerAF)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Fetch listing + seller
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        acreFeet: true,
        pricePerAf: true,
        ownerClerkId: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Create bid (optional if you don't want persistence)
    await prisma.bid.create({
      data: {
        listingId,
        bidderClerkId: userId,
        pricePerAf: Math.round(pricePerAF),
      },
    });

    // Get seller email via Clerk
    const seller = await clerkClient.users.getUser(listing.ownerClerkId);
    const sellerEmail =
      seller?.primaryEmailAddress?.emailAddress ||
      seller?.emailAddresses?.[0]?.emailAddress;
    if (!sellerEmail) {
      // Don't block bid if email missing
      console.warn("Seller has no email on file");
      return NextResponse.json({ ok: true });
    }

    // Get bidder identity for the email
    const bidder = await clerkClient.users.getUser(userId);
    const bidderName =
      bidder?.firstName || bidder?.username || bidder?.id || "A buyer";

    const subject = `New bid on your listing`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
        <h2>New Bid Received</h2>
        <p><strong>${bidderName}</strong> placed a bid on your listing${listing.title ? ` “${listing.title}”` : ""}.</p>
        <ul>
          <li>Listing ID: ${listing.id}</li>
          <li>Bid $/AF: <strong>$${pricePerAF.toLocaleString()}</strong></li>
          <li>Qty (AF): ${listing.acreFeet.toLocaleString()}</li>
        </ul>
        <p>
          <a href="${appUrl(`/listings/${listing.id}`)}" target="_blank">Review the bid</a>
        </p>
      </div>
    `;

    await sendEmail({
      to: sellerEmail,
      subject,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
