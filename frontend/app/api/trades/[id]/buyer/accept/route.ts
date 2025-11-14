// app/api/trades/[id]/buyer/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, SignatureProgress, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer, findTradeByAnyId, createBuyerSignatureLink } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, appUrl } from "@/lib/email";

/** Choose a valid Trade status for accepted/pending buyer signature */
function pickAcceptedPendingTradeStatus():
  (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_BUYER_SIGNATURE ??
    TS.ACCEPTED_PENDING_SIGNATURE ??
    TS.ACCEPTED_PENDING_SELLER_SIGNATURE ??
    TS.ACCEPTED ??
    TS.PENDING ??
    TS.OFFERED
  );
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

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
export async function HEAD() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Accept: Trade.id or Transaction.id
    const trade = await findTradeByAnyId(rawId);
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Must be the BUYER to trigger seller-sign flow
    const viewer = await getViewer(req as any, trade as any);
    if (viewer.role !== "buyer") {
      return NextResponse.json(
        { error: "Forbidden", tip: "Sign in as the buyer or include ?role=buyer&token=<buyerToken>." },
        { status: 403 }
      );
    }

    // Transition Trade -> accepted/pending seller signature
    const TRADE_ACCEPTED = pickAcceptedPendingTradeStatus();
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TRADE_ACCEPTED,
        lastActor: Party.BUYER,
        version: { increment: 1 },
        buyerSignStatus: SignatureProgress.REQUESTED,
        sellerSignStatus: SignatureProgress.NONE,
        buyerSignUrl: null,
        sellerSignUrl: null,
        events: {
          create: {
            actor: "buyer",
            kind: "ACCEPT",
            payload: {
              previousStatus: (trade as any).status,
              round: (trade as any).round,
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
        sellerToken: true,
        buyerToken: true,
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
        console.warn("[buyer/accept] transaction sync skipped:", (e as any)?.message);
      }
    }

    // Create buyer signing link
    let signLink = "";
    try {
      signLink = await createBuyerSignatureLink(updated.id, updated.buyerToken as any);
      await prisma.trade.update({
        where: { id: updated.id },
        data: { buyerSignUrl: signLink, sellerSignUrl: null },
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Failed to create buyer sign URL",
          details: e?.message || "Unknown error",
          hint: "Check DocuSign credentials or Dropbox Sign fallback configuration.",
        },
        { status: 502 }
      );
    }

    if (!signLink) {
      return NextResponse.json(
        { error: "Buyer sign URL missing", errorCode: "SIGN_URL_MISSING" },
        { status: 502 }
      );
    }

    // Notify SELLER (best-effort)
    const [buyerLocal, sellerLocal] = await Promise.all([
      prisma.user.findUnique({
        where: { id: updated.buyerUserId || "" },
        select: { name: true, clerkId: true },
      }),
      prisma.user.findUnique({
        where: { id: updated.sellerUserId || "" },
        select: { name: true, clerkId: true, email: true },
      }),
    ]);

    let buyerName = buyerLocal?.name || "Buyer";
    let buyerEmail = buyerLocal?.email || "";
    let sellerName = sellerLocal?.name || "Seller";
    let sellerEmail = sellerLocal?.email || "";

    if ((!buyerEmail || !buyerName) && buyerLocal?.clerkId) {
      try {
        const buyerClerk = await clerkClient.users.getUser(buyerLocal.clerkId);
        buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || buyerName;
        buyerEmail =
          buyerEmail ||
          buyerClerk.emailAddresses?.find((e) => e.id === buyerClerk.primaryEmailAddressId)?.emailAddress ||
          buyerClerk.emailAddresses?.[0]?.emailAddress ||
          "";
      } catch { /* non-fatal */ }
    }

    if (!sellerEmail && sellerLocal?.clerkId) {
      try {
        const sellerClerk = await clerkClient.users.getUser(sellerLocal.clerkId);
        sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || sellerName;
        sellerEmail =
          sellerClerk.emailAddresses?.find(e => e.id === sellerClerk.primaryEmailAddressId)?.emailAddress ??
          sellerClerk.emailAddresses?.[0]?.emailAddress ??
          "";
      } catch { /* non-fatal */ }
    }

    if (buyerEmail) {
      const buyerViewLink = appUrl(
        `/t/${updated.id}?role=buyer${updated.buyerToken ? `&token=${updated.buyerToken}` : ""}&action=awaiting-buyer-signature`
      );

      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 12px">It’s time to sign</h2>
          <p>Hello ${buyerName},</p>
          <p>You accepted the seller’s terms. Please review and sign the transfer agreement so we can notify the seller.</p>
          <p style="margin:16px 0">
            <a href="${signLink}" style="display:inline-block;background:#0a6b58;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">
              Review & Sign with DocuSign
            </a>
          </p>
          <p style="font-size:14px;color:#334155">If the button doesn’t work, copy and paste this link:<br/>
            <a href="${signLink}" style="color:#0a6b58">${signLink}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p>You can also view the transaction here: <a href="${buyerViewLink}">${buyerViewLink}</a></p>
        </div>
      `;

      await sendEmail({
        to: buyerEmail,
        subject: "Please sign the transfer agreement",
        html,
        preheader: "Review and sign to keep things moving.",
      });
    }

    if (sellerEmail) {
      // Minimal, robust HTML (use your template system if you prefer)
      const priceLabel = `$${(updated.pricePerAf / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}/AF`;

      const viewLinkForSeller = appUrl(
        `/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}&action=awaiting-buyer-signature`
      );

      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 12px">Buyer accepted — awaiting signature</h2>
          <p>Hello ${sellerName},</p>
          <p>${buyerName} accepted your terms. We asked them to sign the agreement and will email you once it’s your turn.</p>
          <ul>
            <li><strong>District:</strong> ${updated.district || "—"}</li>
            <li><strong>Water:</strong> ${updated.waterType || "—"}</li>
            <li><strong>Volume:</strong> ${updated.volumeAf} AF</li>
            <li><strong>Price:</strong> ${priceLabel}</li>
          </ul>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p>You can also view this offer here: <a href="${viewLinkForSeller}">${viewLinkForSeller}</a></p>
        </div>
      `;

      await sendEmail({
        to: sellerEmail,
        subject: "Buyer accepted — awaiting buyer signature",
        html,
        preheader: "We’ll let you know when it’s time to sign.",
      });
    }

    // Friendly client hint/redirect
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redirectUrl = new URL(`/t/${updated.id}`, base);
    redirectUrl.searchParams.set("role", "buyer");
    redirectUrl.searchParams.set("action", "awaiting-buyer-signature");
    if ((trade as any).buyerToken) {
      redirectUrl.searchParams.set("token", (trade as any).buyerToken);
    }
    
    return NextResponse.json({
      ok: true,
      tradeId: updated.id,
      status: updated.status,
      message: "Awaiting buyer signature",
      signLink,
      redirectUrl: redirectUrl.toString(),
    });
  } catch (e: any) {
    console.error("[trades/:id/buyer/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
