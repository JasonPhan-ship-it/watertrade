// app/api/transactions/[id]/kickoff/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = params.id;
    const trx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        listing: { select: { title: true } },
        seller: { select: { email: true, name: true } },
        buyer: { select: { email: true, name: true } },
      },
    });
    if (!trx) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // TODO: integrate DocuSign/HelloSign; then move status forward:
    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: "PENDING_SELLER_SIGNATURE" }, // <-- enum value in your schema
      select: {
        id: true,
        acreFeet: true,
        pricePerAF: true,
        listingId: true,
      },
    });

    const commonHtml = `
      <ul>
        <li>Transaction: ${updated.id}</li>
        <li>Listing: ${trx.listing?.title ?? trx.listingId}</li>
        <li>Qty (AF): ${updated.acreFeet.toLocaleString()}</li>
        <li>Price $/AF: $${(updated.pricePerAF / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</li>
        <li>Total: $${((updated.acreFeet * updated.pricePerAF) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</li>
      </ul>
      <p><a href="${appUrl(`/transactions/${updated.id}`)}" target="_blank">Open transaction</a></p>
    `;

    if (trx.seller?.email) {
      await sendEmail({
        to: trx.seller.email,
        subject: "Documents ready – please review",
        html: `<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
          <h2>Docs are ready</h2>
          <p>The transaction moved to the documentation stage.</p>
          ${commonHtml}
        </div>`,
      });
    }

    if (trx.buyer?.email) {
      await sendEmail({
        to: trx.buyer.email,
        subject: "Documents sent – please review",
        html: `<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
          <h2>Docs were sent</h2>
          <p>Please review and sign to proceed.</p>
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
