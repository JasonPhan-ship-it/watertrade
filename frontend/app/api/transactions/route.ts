import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      listingId,
      type, // "BUY_NOW"
      acreFeet,
      pricePerAF,
    } = body || {};

    if (!listingId || !acreFeet || !pricePerAF || type !== "BUY_NOW") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        ownerClerkId: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const trx = await prisma.transaction.create({
      data: {
        listingId,
        buyerClerkId: userId,
        sellerClerkId: listing.ownerClerkId,
        type: "BUY_NOW",
        acreFeet: Math.round(acreFeet),
        pricePerAf: Math.round(pricePerAF),
        status: "PENDING",
      },
      select: { id: true },
    });

    // Email seller immediately
    const seller = await clerkClient.users.getUser(listing.ownerClerkId);
    const sellerEmail =
      seller?.primaryEmailAddress?.emailAddress ||
      seller?.emailAddresses?.[0]?.emailAddress;

    if (sellerEmail) {
      const buyer = await clerkClient.users.getUser(userId);
      const buyerName =
        buyer?.firstName || buyer?.username || buyer?.id || "A buyer";

      await sendEmail({
        to: sellerEmail,
        subject: `Buy Now initiated on your listing`,
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
            <h2>Buy Now Initiated</h2>
            <p><strong>${buyerName}</strong> started a Buy Now on your listing${listing.title ? ` “${listing.title}”` : ""}.</p>
            <ul>
              <li>Transaction ID: ${trx.id}</li>
              <li>Qty (AF): ${Number(acreFeet).toLocaleString()}</li>
              <li>Price $/AF: $${Number(pricePerAF).toLocaleString()}</li>
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
