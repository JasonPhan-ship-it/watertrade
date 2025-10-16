export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Party, SignatureProgress, TradeStatus, TransactionStatus } from "@prisma/client";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { appUrl, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  createSellerSignatureLink,
  ensureTradeFromAnyIdOrCreate,
  findTradeByAnyId,
  getViewer,
} from "@/lib/trade";

/** Accept Trade.id OR Transaction.id and create a Trade if missing */
function pickTxnPendingSellerSig():
  (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return TXS.PENDING_SELLER_SIGNATURE ?? TXS.PENDING_SIGNATURE ?? TXS.PENDING ?? TXS.ACCEPTED ?? null;
}

function pickAcceptedPendingSellerStatus():
  (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_SELLER_SIGNATURE ??
    TS.ACCEPTED_PENDING_SIGNATURE ??
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
    if (!rawId) return NextResponse.json({ error: "Missing id", errorCode: "MISSING_ID" }, { status: 400 });

    // Read optional token from request body as well
    let bodyToken: string | undefined;
    let bodyRole: string | undefined;
    try {
      const body = (await req.json()) as any;
      bodyToken = body?.token || body?.tradeToken || undefined;
      bodyRole = body?.role || undefined;
    } catch { /* empty body ok */ }

    // Accept Trade.id or Transaction.id; create Trade if needed
    let trade;
    try {
      trade = await ensureTradeFromAnyIdOrCreate(rawId);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Unable to create Trade", errorCode: "CREATE_FAILED" }, { status: 422 });
    }
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", errorCode: "NOT_FOUND", hint: "No Trade or Transaction with this id" },
        { status: 404 }
      );
    }

    // AuthZ: seller or admin or valid token
    const viewer = await getViewer(req as any, trade as any);
    const sellerToken = (trade as any).sellerToken || "";
    const bodyRoleIsSeller = (bodyRole || "").toLowerCase() === "seller";
    const tokenMatchViaBody =
      viewer.role !== "seller" && bodyRoleIsSeller && bodyToken && sellerToken && bodyToken === sellerToken;

    let allow = viewer.role === "seller" || tokenMatchViaBody;
    let actedByAdmin: { adminUserId: string; adminEmail?: string | null } | null = null;

    if (!allow) {
      const { userId: clerkId } = auth();
      if (clerkId) {
        const admin = await prisma.user.findUnique({ where: { clerkId }, select: { id: true, role: true, email: true } });
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
          errorCode: "FORBIDDEN",
          details: {
            viewerRole: viewer?.role ?? "unknown",
            via: (viewer as any)?.via ?? "n/a",
            query: { role: url.searchParams.get("role") ?? null, tokenPresent: url.searchParams.has("token") },
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
    const TRADE_ACCEPTED = pickAcceptedPendingSellerStatus();
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TRADE_ACCEPTED,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        sellerSignStatus: SignatureProgress.REQUESTED,
        buyerSignStatus: SignatureProgress.NONE,
        sellerSignUrl: null,
        buyerSignUrl: null,
        events: {
          create: {
            id: randomUUID(),
            actor: "seller",
            kind: "ACCEPT",
            payload: { previousStatus: (trade as any).status, round: (trade as any).round, ...(actedByAdmin ? { actedByAdmin } : {}) },
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
        buyerToken: true,
        sellerToken: true,
      },
    });

    // Sync Transaction status (best-effort)
    if (updated.transactionId) {
      try {
        const pending = pickTxnPendingSellerSig();
        if (pending) {
          await prisma.transaction.update({ where: { id: updated.transactionId }, data: { status: pending } });
        }
      } catch (e) {
        console.warn("[seller/accept] transaction sync skipped:", (e as any)?.message);
      }
    }

    // Create embedded sign URL for seller to sign immediately
    let signLink: string | null = null;
    try {
      signLink = await createSellerSignatureLink(updated.id, sellerToken);
      await prisma.trade.update({
        where: { id: updated.id },
        data: { sellerSignUrl: signLink },
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: "Failed to create seller sign URL", errorCode: "SIGN_URL_FAILED", details: e?.message || "Unknown error" },
        { status: 502 }
      );
    }

    // ---- Notify buyer (status update) + seller confirmation with sign link ----
    const [buyerLocal, sellerLocal] = await Promise.all([
      prisma.user.findUnique({ where: { id: updated.buyerUserId || "" }, select: { email: true, name: true, clerkId: true } }),
      prisma.user.findUnique({ where: { id: updated.sellerUserId || "" }, select: { name: true, clerkId: true, email: true } }),
    ]);

    let buyerName = buyerLocal?.name || "";
    let sellerName = sellerLocal?.name || "";
    let buyerEmail = buyerLocal?.email || "";
    let sellerEmail = sellerLocal?.email || "";

    if ((!buyerEmail || !buyerName) && buyerLocal?.clerkId) {
      try {
        const buyerClerk = await clerkClient.users.getUser(buyerLocal.clerkId);
        buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
        const primary = buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)?.emailAddress;
        buyerEmail = buyerEmail || primary || buyerClerk.emailAddresses?.[0]?.emailAddress || "";
      } catch { /* non-fatal */ }
    }
    if ((!sellerEmail || !sellerName) && sellerLocal?.clerkId) {
      try {
        const sellerClerk = await clerkClient.users.getUser(sellerLocal.clerkId);
        sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
        const primary = sellerClerk.emailAddresses?.find(e => e.id === sellerClerk.primaryEmailAddressId)?.emailAddress;
        sellerEmail = sellerEmail || primary || sellerClerk.emailAddresses?.[0]?.emailAddress || "";
      } catch { /* non-fatal */ }
    }

    const viewLinkForBuyer = appUrl(
      `/t/${updated.id}?role=buyer${(trade as any).buyerToken ? `&token=${(trade as any).buyerToken}` : ""}&action=awaiting-seller-signature`
    );

    if (buyerEmail) {
      const html = `
        <p>Hi ${buyerName || "Buyer"},</p>
        <p>The seller accepted your offer and is signing the transfer agreement now.</p>
        <p>We’ll email you as soon as it’s your turn to sign.</p>
        <p><a href="${viewLinkForBuyer}">View the transaction</a></p>
      `;
      try {
        await sendEmail({ to: buyerEmail, subject: "Seller accepted — awaiting seller signature", html });
      } catch (e) {
        console.warn("[seller/accept] sendEmail (buyer status) failed:", (e as any)?.message);
      }
    }

    if (sellerEmail) {
      const sellerViewLink = appUrl(`/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}`);
      const html = `
        <p>Hi ${sellerName || "Seller"},</p>
        <p>You accepted the buyer’s offer. Please sign the water transfer agreement to move forward.</p>
        <p><a href="${signLink}">Sign with DocuSign</a></p>
        <p>Need to review details? <a href="${sellerViewLink}">View the transaction</a>.</p>
      `;
      try {
        await sendEmail({ to: sellerEmail, subject: "Please sign the transfer agreement", html });
      } catch (e) {
        console.warn("[seller/accept] sendEmail (seller confirm) failed:", (e as any)?.message);
      }
    }

    // Friendly redirect target
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inUrl = new URL(req.url);
    const token = inUrl.searchParams.get("token") || (tokenMatchViaBody ? bodyToken : undefined) || undefined;

    const redirectUrl = new URL(`/t/${updated.id}`, base);
    redirectUrl.searchParams.set("role", "seller");
    redirectUrl.searchParams.set("action", "awaiting-seller-signature");
    if (token) redirectUrl.searchParams.set("token", token);

    return NextResponse.json({
      ok: true,
      tradeId: updated.id,
      status: updated.status,
      message: "Awaiting seller signature",
      redirectUrl: redirectUrl.toString(),
      signLink,
    });
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error", errorCode: "UNEXPECTED" }, { status: 500 });
  }
}
