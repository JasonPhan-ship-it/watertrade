export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, appUrl } from "@/lib/email";
import { auth } from "@clerk/nextjs/server";

async function readBody(req: NextRequest) {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as any;
    return {
      pricePerAf: j.pricePerAf ?? j.pricePerAF ?? j.price_per_af,
      volumeAf: j.volumeAf ?? j.acreFeet ?? j.quantity,
      windowLabel: j.windowLabel ?? j.window_label ?? null,
    };
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return {};
  return {
    pricePerAf: fd.get("pricePerAf") ?? fd.get("pricePerAF") ?? fd.get("price_per_af"),
    volumeAf: fd.get("volumeAf") ?? fd.get("acreFeet") ?? fd.get("quantity"),
    windowLabel: fd.get("windowLabel") ?? fd.get("window_label"),
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: params.id } });
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    // AuthZ: must be the buyer on this transaction
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } });
    if (!me || me.id !== tx.buyerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Ensure Trade exists
    let trade = await prisma.trade.findFirst({ where: { transactionId: tx.id } });
    if (!trade) {
      trade = await prisma.trade.create({
        data: {
          transactionId: tx.id,
          sellerUserId: tx.sellerId!,
          buyerUserId: tx.buyerId!,
          district: tx.listingDistrictSnapshot ?? null,
          waterType: tx.listingWaterTypeSnapshot ?? null,
          pricePerAf: tx.pricePerAF ?? 0,
          volumeAf: tx.acreFeet ?? 0,
          status: TradeStatus.PENDING,
          round: 0,
        },
      });
    }

    const { pricePerAf, volumeAf, windowLabel } = await readBody(req);
    const pricePerAfNum = Number(pricePerAf);
    const volumeAfNum = Number(volumeAf);
    if (!Number.isFinite(pricePerAfNum) || !Number.isFinite(volumeAfNum))
      return NextResponse.json({ error: "pricePerAf (cents) and volumeAf (AF) must be numeric" }, { status: 400 });
    if (pricePerAfNum <= 0 || volumeAfNum <= 0)
      return NextResponse.json({ error: "pricePerAf and volumeAf must be > 0" }, { status: 400 });

    const currentCents = trade.pricePerAf ?? tx.pricePerAF ?? 0;
    if (pricePerAfNum < currentCents) {
      return NextResponse.json(
        { error: `Counter price must be at least ${(currentCents / 100).toFixed(2)} USD/AF.` },
        { status: 400 }
      );
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_BUYER,
        pricePerAf: pricePerAfNum,
        volumeAf: volumeAfNum,
        windowLabel: typeof windowLabel === "string" && windowLabel.trim() ? windowLabel.trim() : null,
        round: (trade.round ?? 0) + 1,
        lastActor: Party.BUYER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "buyer",
            kind: "COUNTER",
            payload: {
              previousStatus: trade.status,
              pricePerAf: pricePerAfNum,
              volumeAf: volumeAfNum,
              windowLabel: typeof windowLabel === "string" ? windowLabel : null,
              round: (trade.round ?? 0) + 1,
            },
          },
        },
      },
    });

    // Notify seller
    const [sellerUser, buyerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: updated.sellerUserId || tx.sellerId! } }),
      prisma.user.findUnique({ where: { id: updated.buyerUserId || tx.buyerId! } }),
    ]);

    let sellerEmail = sellerUser?.email || "";
    let sellerName = sellerUser?.name || "";
    let buyerName = buyerUser?.name || "";

    if (buyerUser?.clerkId || sellerUser?.clerkId) {
      try {
        const [buyerClerk, sellerClerk] = await Promise.all([
          buyerUser?.clerkId ? clerkClient.users.getUser(buyerUser.clerkId) : null,
          sellerUser?.clerkId ? clerkClient.users.getUser(sellerUser.clerkId) : null,
        ]);
        if (buyerClerk) buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
        if (sellerClerk) {
          sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
          const primary = sellerClerk.emailAddresses?.find(e => e.id === sellerClerk.primaryEmailAddressId)?.emailAddress;
          sellerEmail = sellerEmail || primary || sellerClerk.emailAddresses?.[0]?.emailAddress || "";
        }
      } catch {}
    }

    if (sellerEmail) {
      const viewLink = appUrl(`/t/${updated.id}?role=seller`);
      const html = `<p>Hi ${sellerName || "Seller"}, the buyer (${buyerName || "Buyer"}) sent a counter: ${
        updated.volumeAf
      } AF @ $${(updated.pricePerAf / 100).toFixed(2)}/AF. <a href="${viewLink}">View</a></p>`;
      await sendEmail({ to: sellerEmail, subject: "Buyer sent a counteroffer", html, preheader: "Counter offer" });
    }

    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
