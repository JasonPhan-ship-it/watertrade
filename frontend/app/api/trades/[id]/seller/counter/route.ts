export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient, auth } from "@clerk/nextjs/server";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { sendEmail, appUrl, renderBuyerCounterEmail } from "@/lib/email";

/** Body parsing that accepts JSON or form-data (NO window fields) */
async function readBody(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as any;
    return {
      pricePerAf: j.pricePerAf ?? j.pricePerAF ?? j.price_per_af,
      volumeAf: j.volumeAf ?? j.acreFeet ?? j.quantity,
      token: j.token ?? j.tradeToken ?? undefined,
      role: j.role ?? undefined,
    };
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return {};
  return {
    pricePerAf: fd.get("pricePerAf") ?? fd.get("pricePerAF") ?? fd.get("price_per_af"),
    volumeAf: fd.get("volumeAf") ?? fd.get("acreFeet") ?? fd.get("quantity"),
    token: (fd.get("token") as string) || (fd.get("tradeToken") as string) || undefined,
    role: (fd.get("role") as string) || undefined,
  };
}

/** Create or fetch a Trade given a Trade.id OR a Transaction.id */
async function ensureTradeFromAnyIdOrThrow(id: string) {
  const existing = await findTradeByAnyId(id);
  if (existing) return existing;

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { listing: { select: { id: true, district: true, title: true, waterType: true } } },
  });
  if (!txn) return null;

  const listingId = txn.listing?.id ?? null;
  const district =
    (txn as any).districtSnapshot ??
    txn.listing?.district ??
    null;

  if (!listingId || !district) {
    throw new Error("Cannot create Trade: missing listingId or district on Transaction/Listing.");
  }

  const created = await prisma.trade.create({
    data: {
      transactionId: txn.id,
      listingId,
      district,
      sellerUserId: (txn as any).sellerUserId ?? (txn as any).sellerId ?? undefined,
      buyerUserId:  (txn as any).buyerUserId  ?? (txn as any).buyerId  ?? undefined,
      pricePerAf:   (txn as any).pricePerAf   ?? (txn as any).pricePerAF ?? undefined,
      volumeAf:     (txn as any).volumeAf     ?? (txn as any).acreFeet   ?? undefined,
      status: TradeStatus.OFFERED,
      round: 0,
    } as any,
  });

  return created;
}

/** Pull role/token from query, headers, body, and referer */
async function extractRoleToken(req: NextRequest) {
  const url = new URL(req.url);
  let role = url.searchParams.get("role") || undefined;
  let token = url.searchParams.get("token") || undefined;

  // headers
  const h = req.headers;
  if (!token) token = h.get("x-trade-token") || h.get("x-magic-token") || undefined;
  if (!token && h.get("authorization")) {
    const m = /^Bearer\s+(.+)$/i.exec(h.get("authorization") || "");
    if (m) token = m[1];
  }
  if (!role) role = h.get("x-role") || undefined;

  // body (best-effort)
  if (!token || !role) {
    try {
      const clone = req.clone();
      const body: any = await clone.json();
      token = token || body?.token || body?.tradeToken || undefined;
      role = role || body?.role || undefined;
    } catch { /* ignore — bodyless or not JSON */ }
  }

  // referer
  if (!token || !role) {
    const ref = req.headers.get("referer");
    if (ref) {
      try {
        const r = new URL(ref);
        if (!token) token = r.searchParams.get("token") || undefined;
        if (!role) role = r.searchParams.get("role") || undefined;
      } catch { /* ignore */ }
    }
  }

  return {
    role: role?.toLowerCase(),
    token,
    saw: {
      queryRole: url.searchParams.get("role"),
      queryTokenPresent: url.searchParams.has("token"),
    },
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = (params.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Ensure Trade exists (Trade.id or Transaction.id accepted)
    let trade;
    try {
      trade = await ensureTradeFromAnyIdOrThrow(id);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Unable to create Trade" }, { status: 422 });
    }
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Parse input
    const { pricePerAf, volumeAf } = await readBody(req);
    const pricePerAfNum = Number(pricePerAf);
    const volumeAfNum = Number(volumeAf);

    // AuthZ
    const viewer = await getViewer(req, trade as any);
    const { role: extraRole, token: extraToken, saw } = await extractRoleToken(req);

    // Allow if:
    //  - viewer is seller, OR
    //  - extracted token matches sellerToken (role optional -> assume seller), OR
    //  - current auth user is ADMIN
    let allow = viewer.role === "seller";
    let tokenMatchedSeller = false;

    if (!allow && extraToken && (trade as any).sellerToken) {
      tokenMatchedSeller = extraToken === (trade as any).sellerToken && (!extraRole || extraRole === "seller");
      allow = tokenMatchedSeller;
    }

    if (!allow) {
      const { userId: clerkId } = auth();
      if (clerkId) {
        const me = await prisma.user.findUnique({ where: { clerkId }, select: { role: true } });
        if (me?.role === "ADMIN") allow = true;
      }
    }

    if (!allow) {
      const hdrTok =
        req.headers.get("x-trade-token") ||
        req.headers.get("x-magic-token") ||
        (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
        "";
      return NextResponse.json(
        {
          error: "Forbidden",
          details: {
            viewer,
            saw,
            headers: {
              xTradeTokenPresent: !!req.headers.get("x-trade-token"),
              xMagicTokenPresent: !!req.headers.get("x-magic-token"),
              authBearerPresent: !!req.headers.get("authorization"),
              headerTokenPreview: hdrTok ? hdrTok.slice(0, 4) + "…" : null,
            },
            referer: req.headers.get("referer") || null,
            extraExtracted: {
              role: extraRole || null,
              tokenProvided: !!extraToken,
              tokenPreview: extraToken ? extraToken.slice(0, 4) + "…" : null,
            },
            tradeHasSellerToken: !!(trade as any).sellerToken,
          },
          tip: "Include ?role=seller&token=<sellerToken> in the request URL or send JSON { token: '<sellerToken>' }. Signing in as ADMIN also works.",
        },
        { status: 403 }
      );
    }

    // Validate numbers AFTER auth (same as before)
    if (!Number.isFinite(pricePerAfNum) || !Number.isFinite(volumeAfNum)) {
      return NextResponse.json(
        { error: "pricePerAf (cents) and volumeAf (AF) must be numeric" },
        { status: 400 }
      );
    }
    if (pricePerAfNum <= 0 || volumeAfNum <= 0) {
      return NextResponse.json(
        { error: "pricePerAf and volumeAf must be > 0" },
        { status: 400 }
      );
    }

    // Optional guard: don't counter below current ask
    if (typeof (trade as any).pricePerAf === "number" && pricePerAfNum < (trade as any).pricePerAf) {
      return NextResponse.json(
        { error: `Counter price must be at least ${((trade as any).pricePerAf / 100).toFixed(2)} USD/AF.` },
        { status: 400 }
      );
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_SELLER,
        pricePerAf: pricePerAfNum,
        volumeAf: volumeAfNum,
        round: (trade as any).round ? (trade as any).round + 1 : 1,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "COUNTER",
            payload: {
              previousStatus: (trade as any).status,
              pricePerAf: pricePerAfNum,
              volumeAf: volumeAfNum,
              round: ((trade as any).round ?? 0) + 1,
              ...(tokenMatchedSeller ? { usedSellerToken: true } : {}),
            },
          },
        },
      },
    });

    // Notify buyer (best-effort)
    const [sellerUser, buyerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: (updated as any).sellerUserId } }),
      prisma.user.findUnique({ where: { id: (updated as any).buyerUserId } }),
    ]);

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
          const primary = buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)?.emailAddress;
          const firstAny = buyerClerk.emailAddresses?.[0]?.emailAddress;
          buyerEmail = buyerEmail || primary || firstAny || "";
        }
      } catch { /* non-fatal */ }
    }

    if (buyerEmail) {
      const viewLink = appUrl(`/t/${updated.id}?role=buyer${(updated as any).buyerToken ? `&token=${(updated as any).buyerToken}` : ""}`);
      const counterLink = `${viewLink}&action=counter`;
      const declineLink = `${viewLink}&action=decline`;

      const { html, preheader } = renderBuyerCounterEmail({
        buyerName,
        sellerName,
        offer: {
          listingTitle: (updated as any).listingTitle || "Water Trade",
          district: (updated as any).district || "—",
          waterType: (updated as any).waterType || null,
          volumeAf: updated.volumeAf ?? 0,
          pricePerAf: updated.pricePerAf ?? 0,
          // windowLabel intentionally omitted
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

    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
