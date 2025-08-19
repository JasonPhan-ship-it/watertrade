// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, createBuyerSignatureLink } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, renderBuyerAcceptedEmail } from "@/lib/email";
import { appUrl } from "@/lib/email";

export async function GET(req: NextRequest, ctx: { params: { id: string }}) {
  // Allow GET for magic-link click; you can also offer POST
  return await POST(req, ctx);
}

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const trade = await prisma.trade.findUnique({ where: { id: params.id } });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewer = await getViewer(req, trade);
  if (viewer.role !== "seller") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Ensure seller can act now
  if (!["OFFERED", "COUNTERED_BY_BUYER"].includes(trade.status)) {
    return NextResponse.json({ error: "Trade is not awaiting seller decision." }, { status: 400 });
  }

  // Transition → buyer needs to sign first
  const buyerSignUrl = await createBuyerSignatureLink(trade.id, trade.buyerToken);
  const updated = await prisma.trade.update({
    where: { id: trade.id },
    data: {
      status: "ACCEPTED_PENDING_BUYER_SIGNATURE",
      buyerSignStatus: "REQUESTED",
      buyerSignUrl,
      lastActor: "seller",
      version: { increment: 1 },
      events: { create: { actor: "seller", kind: "ACCEPT", payload: {} } },
    },
  });

  // Notify buyer to sign
  const buyer = await clerkClient.users.getUser(updated.buyerUserId).catch(() => null);
  const buyerEmail =
    buyer?.emailAddresses?.find(e => e.id === buyer?.primaryEmailAddressId)?.emailAddress ||
    buyer?.emailAddresses?.[0]?.emailAddress;
  const buyerName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ") || buyer?.username || "Buyer";

  if (buyerEmail) {
    const { html, preheader } = renderBuyerAcceptedEmail({
      buyerName,
      sellerName: undefined,
      offer: {
        listingTitle: updated.listingId,
        district: updated.district,
        waterType: updated.waterType ?? undefined,
        volumeAf: updated.volumeAf,
        pricePerAf: updated.pricePerAf,
        priceLabel: `$${updated.pricePerAf.toLocaleString()}/AF`,
        windowLabel: updated.windowLabel ?? undefined,
      },
      signLink: buyerSignUrl,
      viewLink: appUrl(`/t/${updated.id}?token=${updated.buyerToken}`),
    });

    await sendEmail({
      to: buyerEmail,
      subject: "Offer accepted — signature required",
      html,
      preheader,
      idempotencyKey: `trade:${updated.id}:buyer-sign`,
    });
  }

  // If GET (magic link), redirect to the trade page
  if (req.method === "GET") {
    return NextResponse.redirect(appUrl(`/t/${updated.id}?token=${updated.sellerToken}`));
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
