// app/api/trades/[id]/seller/counter/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderBuyerCounterEmail, appUrl } from "@/lib/email";

/** Read either JSON or form-data and normalize fields */
async function readBody(req: NextRequest) {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as any;
    return {
      pricePerAf: json.pricePerAf,
      volumeAf: json.volumeAf,
      windowLabel: json.windowLabel,
    };
  }
  // fallback: form-data
  const fd = await req.formData().catch(() => null);
  if (!fd) return {};
  return {
    pricePerAf: fd.get("pricePerAf"),
    volumeAf: fd.get("volumeAf"),
    windowLabel: fd.get("windowLabel"),
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // AuthZ: must be seller
    const viewer = await getViewer(req, trade);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse body (json or form)
    const { pricePerAf, volumeAf, windowLabel } = await readBody(req);

    // Coerce to numbers (Trade.volumeAf, Trade.pricePerAf are Int; pricePerAf is cents)
    const pricePerAfNum = Number(pricePerAf);
    const volumeAfNum = Number(volumeAf);

    if (!Number.isFinite(pricePerAfNum) || !Number.isFinite(volumeAfNum)) {
      return NextResponse.json({ error: "pricePerAf and volumeAf must be numbers" }, { status: 400 });
    }
    if (pricePerAfNum <= 0 || volumeAfNum <= 0) {
      return NextResponse.json({ error: "pricePerAf and volumeAf must be > 0" }, { status: 400 });
    }

    // Update Trade (counter), bump round & version, append event
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_SELLER,
        pricePerAf: pricePerAfNum,
        volumeAf: volumeAfNum,
        windowLabel: typeof windowLabel === "string" && windowLabel.trim() ? windowLabel.trim() : null,
        round: trade.round + 1,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "COUNTER",
            payload: {
              previousStatus: trade.status,
              pricePerAf: pricePerAfNum,
              volumeAf: volumeAfNum,
              windowLabel: windowLabel ?? null,
              round: trade.round + 1,
            },
          },
        },
      },
    });

    // Fetch buyer/seller from your own User table first
    const [sellerUser, buyerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: trade.sellerUserId } }),
      prisma.user.findUnique({ where: { id: trade.buyerUserId } }),
    ]);

    // Optionally enrich names/emails with Clerk if clerkId present
    let sellerName = sellerUser?.name || "";
    let buyerName = buyerUser?.name || "";
    let buyerEmail = buyerUser?.email || "";

    if (buyerUser?.clerkId || sellerUser?.clerkId) {
      try {
        const [sellerClerk, buyerClerk] = await Promise.all([
          sellerUser?.clerkId ? clerkClient.users.getUser(sellerUser.clerkId) : null,
          buyerUser?.clerkId ? clerkClient.users.getUser(buyerUser.clerkId) : null,
        ]);
        if (sellerClerk) sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
        if (buyerClerk) {
          buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
          const primary = buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)
            ?.emailAddress;
          const firstAny = buyerClerk.emailAddresses?.[0]?.emailAddress;
          buyerEmail = buyerEmail || primary || firstAny || "";
        }
      } catch {
        // Non-fatal; just fall back to local user fields
      }
    }

    // Send email to buyer if we have an address
    if (buyerEmail) {
      const viewLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}`);
      const counterLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}&action=counter`);
      const declineLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}&action=decline`);

      const { html, preheader } = renderBuyerCounterEmail({
        buyerName,
        sellerName,
        offer: {
          listingTitle: updated.windowLabel || "Offer Terms",
          district: updated.district,
          waterType: updated.waterType ?? undefined,
          volumeAf: updated.volumeAf,
          pricePerAf: updated.pricePerAf, // cents
          priceLabel: `$${(updated.pricePerAf / 100).toLocaleString()}/AF`,
          windowLabel: updated.windowLabel ?? undefined,
        },
        viewLink,
        counterLink,
        declineLink,
      });

      await sendEmail({
        to: buyerEmail,
        subject: "Seller sent a counteroffer",
        html,
        preheader,
      });
    }

    // Redirect back to the trade view (absolute URL recommended)
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(new URL(`/t/${updated.id}`, base));

    // If you prefer JSON instead of redirect:
    // return NextResponse.json({ ok: true, trade: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
