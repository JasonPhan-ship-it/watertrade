// app/api/auctions/bid/route.ts
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";

export const runtime = "nodejs";

async function getOrCreateUserFromClerk(clerkId: string) {
  let user = await prisma.user.findUnique({ where: { clerkId } });
  if (user) return user;

  // Create a local User row based on Clerk
  const cu = await clerkClient.users.getUser(clerkId);
  const email =
    cu?.primaryEmailAddress?.emailAddress || cu?.emailAddresses?.[0]?.emailAddress;
  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || "";

  user = await prisma.user.create({
    data: {
      clerkId,
      email: email || `${clerkId}@example.local`, // fallback to avoid null
      name,
    },
  });
  return user;
}

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const me = await getOrCreateUserFromClerk(clerkId);

    const body = await req.json();
    const listingId: string = body?.listingId;
    const pricePerAF: number = Number(body?.pricePerAF);

    if (!listingId || !Number.isFinite(pricePerAF)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 👇 Match your schema field names: pricePerAF + seller relation
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        acreFeet: true,
        pricePerAF: true, // <-- capital AF
        sellerId: true,
        seller: { select: { id: true, email: true, name: true } },
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.seller) {
      return NextResponse.json({ error: "Listing has no seller assigned" }, { status: 400 });
    }

    // Create the bid (price in cents/AF as per your schema)
    await prisma.bid.create({
      data: {
        listingId,
        bidderId: me.id,
        pricePerAF: Math.round(pricePerAF),
      },
    });

    // Email the seller
    const sellerEmail = listing.seller.email;
    if (sellerEmail) {
      const subject = `New bid on your listing`;
      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
          <h2>New Bid Received</h2>
          <p>A buyer placed a bid on your listing${listing.title ? ` “${listing.title}”` : ""}.</p>
          <ul>
            <li>Listing ID: ${listing.id}</li>
            <li>Bid $/AF: <strong>$${(pricePerAF / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></li>
            <li>Qty (AF): ${listing.acreFeet.toLocaleString()}</li>
          </ul>
          <p><a href="${appUrl(`/listings/${listing.id}`)}" target="_blank">Review the bid</a></p>
        </div>`;
      await sendEmail({ to: sellerEmail, subject, html });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
