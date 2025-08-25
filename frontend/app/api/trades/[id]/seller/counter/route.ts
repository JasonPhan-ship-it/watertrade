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

  // Prefer JSON
  if (ctype.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as any;
    return {
      // Expecting cents (integer) and AF (number)
      pricePerAf: json.pricePerAf ?? json.pricePerAF ?? json.price_per_af,
      volumeAf: json.volumeAf ?? json.acreFeet ?? json.quantity,
      windowLabel: json.windowLabel ?? json.window_label ?? null,
    };
  }

  // Fallback: form-data
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
    // Load trade
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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
      return NextResponse.json(
        { error: "pricePerAf (cents) and volumeAf (AF) must be numeric" },
        { status: 400 }
      );
    }
    if (pricePerAfNum <= 0 || volumeAfNum <= 0) {
      return NextResponse.json(
        { error: "pricePerAf and volumeAf must be greater than 0" },
        { status: 400 }
      );
    }

    // 🔒 Server-side guard: new price must be >= current offer
    if (typeof trade.pricePerAf === "number" && pricePerAfNum < trade.pricePerAf) {
      return NextResponse.json(
        {
          error: `Counter price must be at least the current offer (${(trade.pricePerAf / 100).toFixed(
            2
          )} USD/AF).`,
        },
        { status: 400 }
      );
    }

    // Update Trade (counter), bump round & version, append event
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_SELLER,
        pricePerAf: pricePerAfNum,
        volumeAf: volumeAfNum,
        windowLabel:
          typeof windowLabel === "string" && windowLabel.trim() ? windowLabel.trim() : null,
        round: (trade.round ?? 0) + 1,
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
              windowLabel: typeof windowLabel === "string" ? windowLabel : null,
              round: (trade.round ?? 0) + 1,
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
          const primary = buyerClerk.emailAddresses?.find(
            (e) => e.id === buyerClerk.primaryEmailAddressId
          )?.emailAddress;
          const firstAny = buyerClerk.emailAddresses?.[0]?.emailAddress;
          buyerEmail = buyerEmail || primary || firstAny || "";
        }
      } catch {
        // Non-fatal; fall back to local user fields
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
          priceLabel: `$${(updated.pricePerAf / 100).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}/AF`,
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

    // ✅ Return JSON so the client can show success UI, then refresh
    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
