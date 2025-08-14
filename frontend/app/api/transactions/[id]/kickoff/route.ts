import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = params.id;
    const trx = await prisma.transaction.findUnique({
      where: { id },
      include: { listing: true },
    });
    if (!trx) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // TODO: integrate DocuSign/HelloSign here, then:
    await prisma.transaction.update({
      where: { id },
      data: { status: "DOCS_SENT" },
    });

    // Notify both parties that docs/payment steps started
    const seller = await clerkClient.users.getUser(trx.sellerClerkId);
    const buyer = await clerkClient.users.getUser(trx.buyerClerkId);

    const sellerEmail =
      seller?.primaryEmailAddress?.emailAddress || seller?.emailAddresses?.[0]?.emailAddress;
    const buyerEmail =
      buyer?.primaryEmailAddress?.emailAddress || buyer?.emailAddresses?.[0]?.emailAddress;

    const commonHtml = `
      <ul>
        <li>Transaction: ${trx.id}</li>
        <li>Listing: ${trx.listing?.title ?? trx.listingId}</li>
        <li>Qty (AF): ${trx.acreFeet.toLocaleString()}</li>
        <li>Price $/AF: $${trx.pricePerAf.toLocaleString()}</li>
      </ul>
      <p><a href="${appUrl(`/transactions/${trx.id}`)}" target="_blank">Open transaction</a></p>
    `;

    if (sellerEmail) {
      await sendEmail({
        to: sellerEmail,
        subject: "Documents sent – action required",
        html: `<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
          <h2>Docs Sent to Parties</h2>
          <p>Transaction has moved to the documentation stage.</p>
          ${commonHtml}
        </div>`,
      });
    }

    if (buyerEmail) {
      await sendEmail({
        to: buyerEmail,
        subject: "Documents sent – action required",
        html: `<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
          <h2>Docs Sent to Parties</h2>
          <p>Please review and sign the documents to proceed.</p>
          ${commonHtml}
        </div>`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to kickoff docs" }, { status: 500 });
  }
}
