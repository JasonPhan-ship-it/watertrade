// frontend/app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { sendEmail, appUrl, renderBuyerAcceptedEmail } from "@/lib/email";
import { createBuyerSignatureLink } from "@/lib/trade";

/** Accept Trade.id OR Transaction.id and create a Trade if missing */
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

/** Choose a reasonable "pending buyer signature" Transaction status */
function pickTxnPendingBuyerSig():
  (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return (
    TXS.PENDING_BUYER_SIGNATURE ??
    TXS.PENDING_SIGNATURE ??
    TXS.PENDING ??
    TXS.ACCEPTED ??
    null
  );
}

/** Choose a valid Trade status for accepted/pending buyer signature */
function pickAcceptedPendingTradeStatus():
  (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_BUYER_SIGNATURE ??
    TS.ACCEPTED ??
    TS.PENDING ??
    TS.OFFERED
  );
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const rawId = (params.id || "").trim();
  const trade = rawId ? await findTradeByAnyId(rawId) : null;
  const viewer = trade ? await getViewer(req as any, trade as any) : { role: "unknown", via: "none" as const };

  const { userId: clerkId } = auth();
  const admin = clerkId
    ? await prisma.user.findUnique({ where: { clerkId }, select: { role: true, id: true, email: true, name: true } })
    : null;

  return NextResponse.json({
    ok: true,
    route: "trades/:id/seller/accept",
    id: params.id,
    viewer,
    adminByAuth: admin ? { isAdmin: admin.role === "ADMIN", userId: admin.id, email: admin.email, name: admin.name } : null,
    sawRoleParam: url.searchParams.get("role") ?? null,
    tokenPresent: url.searchParams.has("token"),
    tip: "Include ?role=seller&token=<sellerToken> to act via magic link, or sign in as seller/admin.",
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Read optional token from request body as well (some clients don't pass query/header)
    let bodyToken: string | undefined;
    let bodyRole: string | undefined;
    try {
      const body = (await req.json()) as any;
      bodyToken = body?.token || body?.tradeToken || undefined;
      bodyRole = body?.role || undefined;
    } catch {
      // non-JSON or empty body is fine
    }

    // Accept Trade.id or Transaction.id; create Trade if needed
    let trade;
    try {
      trade = await ensureTradeFromAnyIdOrThrow(rawId);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Unable to create Trade" }, { status: 422 });
    }
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", hint: "No Trade or Transaction with this id" },
        { status: 404 }
      );
    }

    // Primary authZ: seller via getViewer (query/header tokens handled inside getViewer)
    const viewer = await getViewer(req as any, trade as any);

    // Body token fallback: if client posted {token:"..."} and it matches sellerToken, allow.
    let tokenMatchViaBody = false;
    if (viewer.role !== "seller" && bodyToken && (trade as any).sellerToken && bodyRole === "seller") {
      tokenMatchViaBody = bodyToken === (trade as any).sellerToken;
    }

    // ADMIN bypass (signed-in admin may act)
    let allow = viewer.role === "seller" || tokenMatchViaBody;
    let actedByAdmin: { adminUserId: string; adminEmail?: string | null } | null = null;

    if (!allow) {
      const { userId: clerkId } = auth();
      if (clerkId) {
        const admin = await prisma.user.findUnique({
          where: { clerkId },
          select: { id: true, role: true, email: true },
        });
        if (admin?.role === "ADMIN") {
          allow = true;
          actedByAdmin = { adminUserId: admin.id, adminEmail: admin.email };
        }
      }
    }

    if (!allow) {
      const url = new URL(req.url);
      const headerToken =
        req.headers.get("x-trade-token") ||
        req.headers.get("x-magic-token") ||
        (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
        "";
      return NextResponse.json(
        {
          error: "Forbidden",
          details: {
            viewerRole: viewer?.role ?? "unknown",
            via: (viewer as any)?.via ?? "n/a",
            // visibility to debug why token wasn't seen
            query: {
              role: url.searchParams.get("role") ?? null,
              tokenPresent: url.searchParams.has("token"),
            },
            headers: {
              xTradeTokenPresent: !!req.headers.get("x-trade-token"),
              xMagicTokenPresent: !!req.headers.get("x-magic-token"),
              authBearerPresent: !!req.headers.get("authorization"),
              headerTokenPreview: headerToken ? headerToken.slice(0, 4) + "…" : null,
            },
            body: {
              role: bodyRole ?? null,
              tokenProvided: !!bodyToken,
              tokenPreview: bodyToken ? bodyToken.slice(0, 4) + "…" : null,
            },
          },
          tip: "Pass the seller token via query (?role=seller&token=...), header (x-trade-token), or JSON body {role:'seller', token:'...'}; or sign in as ADMIN.",
        },
        { status: 403 }
      );
    }

    // Transition Trade -> accepted/pending buyer signature
    const TRADE_ACCEPTED = pickAcceptedPendingTradeStatus();
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TRADE_ACCEPTED,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            id: crypto.randomUUID(),
            actor: "seller",
            kind: "ACCEPT",
            payload: {
              previousStatus: (trade as any).status,
              round: (trade as any).round,
              ...(actedByAdmin ? { actedByAdmin } : {}),
            },
          },
        },
      },
      select: {
        id: true,
        status: true,
        transactionId: true,
        district: true,
        waterType: true,
        volumeAf: true,
        pricePerAf: true,
        buyerUserId: true,
        sellerUserId: true,
        windowLabel: true,
      },
    });

    // Sync Transaction status (best-effort)
    if (updated.transactionId) {
      try {
        const pending = pickTxnPendingBuyerSig();
        if (pending) {
          await prisma.transaction.update({
            where: { id: updated.transactionId },
            data: { status: pending },
          });
        }
      } catch (e) {
        console.warn("[seller/accept] transaction sync skipped:", (e as any)?.message);
      }
    }

    // ---- Create embedded sign URL for buyer ----
    let signLink: string | null = null;
    try {
      signLink = await createBuyerSignatureLink(updated.id, (trade as any).buyerToken);
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Failed to create buyer sign URL",
          details: e?.message || "Unknown error",
          hint: "Check DROPBOX_SIGN_API_KEY / DROPBOX_SIGN_CLIENT_ID and sample file URL.",
        },
        { status: 502 }
      );
    }

    // ---- Notify buyer (best-effort) ----
    const [buyerLocal, sellerLocal] = await Promise.all([
      prisma.user.findUnique({
        where: { id: updated.buyerUserId || "" },
        select: { email: true, name: true, clerkId: true },
      }),
      prisma.user.findUnique({
        where: { id: updated.sellerUserId || "" },
        select: { name: true, clerkId: true },
      }),
    ]);

    let buyerName = buyerLocal?.name || "";
    let sellerName = sellerLocal?.name || "";
    let buyerEmail = buyerLocal?.email || "";

    if ((!buyerEmail || !buyerName) && buyerLocal?.clerkId) {
      try {
        const buyerClerk = await clerkClient.users.getUser(buyerLocal.clerkId);
        buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
        const primary =
          buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)?.emailAddress;
        buyerEmail = buyerEmail || primary || buyerClerk.emailAddresses?.[0]?.emailAddress || "";
      } catch { /* non-fatal */ }
    }
    if (!sellerName && sellerLocal?.clerkId) {
      try {
        const sellerClerk = await clerkClient.users.getUser(sellerLocal.clerkId);
        sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
      } catch { /* non-fatal */ }
    }

    const viewLinkForBuyer = appUrl(
      `/t/${updated.id}?role=buyer${(trade as any).buyerToken ? `&token=${(trade as any).buyerToken}` : ""}&action=review`
    );

    if (buyerEmail) {
      const { html, preheader } = renderBuyerAcceptedEmail({
        buyerName: buyerName || "Buyer",
        sellerName: sellerName || "Seller",
        offer: {
          listingTitle: updated.windowLabel || "Offer Terms",
          district: updated.district || "",
          waterType: updated.waterType ?? undefined,
          volumeAf: updated.volumeAf,
          pricePerAf: updated.pricePerAf,
          windowLabel: updated.windowLabel ?? undefined,
        },
        signLink: signLink!,
        viewLink: viewLinkForBuyer,
      });

      try {
        await sendEmail({
          to: buyerEmail,
          subject: "Seller accepted — review & sign",
          html,
          preheader,
        });
      } catch (e) {
        console.warn("[seller/accept] sendEmail failed:", (e as any)?.message);
      }
    }

    // Friendly redirect target
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inUrl = new URL(req.url);
    const token = inUrl.searchParams.get("token") || undefined;
    const role = inUrl.searchParams.get("role") || (tokenMatchViaBody ? "seller" : "seller");

    const redirectUrl = new URL(`/t/${updated.id}`, base);
    redirectUrl.searchParams.set("role", role);
    redirectUrl.searchParams.set("action", "awaiting-buyer-signature");
    if (token) redirectUrl.searchParams.set("token", token);

    return NextResponse.json({
      ok: true,
      tradeId: updated.id,
      status: updated.status,
      message: "Awaiting buyer signature",
      redirectUrl: redirectUrl.toString(),
      signLink,
    });
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
