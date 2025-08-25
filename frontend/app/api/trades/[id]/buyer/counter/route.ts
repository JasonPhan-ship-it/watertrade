// app/api/trades/[id]/buyer/counter/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, appUrl } from "@/lib/email";

type RenderOut = { html: string; preheader?: string };

// Optional: try to use a proper seller email template if you have one
async function renderSellerCounterEmailSafe(args: any): Promise<RenderOut> {
  try {
    const mod: any = await import("@/lib/email");
    if (typeof mod.renderSellerCounterEmail === "function") {
      return mod.renderSellerCounterEmail(args) as RenderOut;
    }
  } catch { /* noop */ }

  // fallback minimal HTML
  const {
    sellerName = "",
    buyerName = "",
    offer = {},
    viewLink = "#",
    counterLink = "#",
    declineLink = "#",
  } = args || {};
  const price = typeof offer.pricePerAf === "number" ? (offer.pricePerAf / 100).toFixed(2) : "—";
  const html = `
    <div>
      <p>Hi ${sellerName || "Seller"},</p>
      <p>${buyerName || "The buyer"} sent a counteroffer:</p>
      <ul>
        <li>Volume: ${offer.volumeAf ?? "—"} AF</li>
        <li>Price: $${price}/AF</li>
        <li>Window: ${offer.windowLabel ?? "—"}</li>
      </ul>
      <p>
        <a href="${viewLink}">View</a> ·
        <a href="${counterLink}">Counter</a> ·
        <a href="${declineLink}">Decline</a>
      </p>
    </div>
  `;
  return { html, preheader: "Buyer sent a counteroffer" };
}

/** Read either JSON or form-data and normalize fields */
async function readBody(req: NextRequest) {
  const ctype = req.headers.get("content-type") || "";

  if (ctype.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as any;
    return {
      pricePerAf: json.pricePerAf ?? json.pricePerAF ?? json.price_per_af,
      volumeAf: json.volumeAf ?? json.acreFeet ?? json.quantity,
      windowLabel: json.windowLabel ?? json.window_label ?? null,
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
    // 1) Load trade (this route assumes a Trade already exists)
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2) AuthZ: must be buyer on this trade
    const viewer = await getViewer(req, trade);
    if (viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3) Parse body
    const { pricePerAf, volumeAf, windowLabel } = await readBody(req);
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

    // 4) Guard: price must be >= current offer (use trade.pricePerAf)
    if (typeof trade.pricePerAf === "number" && pricePerAfNum < trade.pricePerAf) {
      return NextResponse.json(
        {
          error: `Counter price must be at least ${(trade.pricePerAf / 100).toFixed(
            2
          )} USD/AF.`,
        },
        { status: 400 }
      );
    }

    // 5) Update Trade as COUNTERED_BY_BUYER
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_BUYER,
        pricePerAf: pricePerAfNum,
        volumeAf: volumeAfNum,
        windowLabel:
          typeof windowLabel === "string" && windowLabel.trim() ? windowLabel.trim() : null,
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

    // 6) Notify seller (lookup local users; optionally enrich via Clerk)
    const [buyerUser, sellerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: trade.buyerUserId } }),
      prisma.user.findUnique({ where: { id: trade.sellerUserId } }),
    ]);

    let buyerName = buyerUser?.name || "";
    let sellerName = sellerUser?.name || "";
    let sellerEmail = sellerUser?.email || "";

    if (buyerUser?.clerkId || sellerUser?.clerkId) {
      try {
        const [buyerClerk, sellerClerk] = await Promise.all([
          buyerUser?.clerkId ? clerkClient.users.getUser(buyerUser.clerkId) : null,
          sellerUser?.clerkId ? clerkClient.users.getUser(sellerUser.clerkId) : null,
        ]);
        if (buyerClerk) buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
        if (sellerClerk) {
          sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
          const primary = sellerClerk.emailAddresses?.find(
            (e) => e.id === sellerClerk.primaryEmailAddressId
          )?.emailAddress;
          const firstAny = sellerClerk.emailAddresses?.[0]?.emailAddress;
          sellerEmail = sellerEmail || primary || firstAny || "";
        }
      } catch { /* non-fatal */ }
    }

    if (sellerEmail) {
      const viewLink = appUrl(`/t/${updated.id}?role=seller&token=${trade.sellerToken ?? ""}`);
      const counterLink = appUrl(`/t/${updated.id}?role=seller&token=${trade.sellerToken ?? ""}&action=counter`);
      const declineLink = appUrl(`/t/${updated.id}?role=seller&token=${trade.sellerToken ?? ""}&action=decline`);

      const { html, preheader } = await renderSellerCounterEmailSafe({
        sellerName,
        buyerName,
        offer: {
          listingTitle: updated.windowLabel || "Offer Terms",
          volumeAf: updated.volumeAf,
          pricePerAf: updated.pricePerAf,
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
        to: sellerEmail,
        subject: "Buyer sent a counteroffer",
        html,
        preheader,
      });
    }

    // 7) Return JSON for modal success UX
    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
