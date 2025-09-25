// app/api/trades/[id]/buyer/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, appUrl } from "@/lib/email";
// If you already have this, import it. If not, add the helper (see TODO below).
import { createSellerSignatureLink } from "@/lib/trade";

/** Choose a valid Trade status for accepted/pending seller signature */
function pickAcceptedPendingTradeStatus():
  (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_SELLER_SIGNATURE ??
    TS.ACCEPTED ??
    TS.PENDING ??
    TS.OFFERED
  );
}

/** Choose a reasonable "pending seller signature" Transaction status */
function pickTxnPendingSellerSig():
  (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return (
    TXS.PENDING_SELLER_SIGNATURE ??
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
        windowLabel: true,
      },
    });

    // Sync Transaction status (best-effort)
    if (updated.transactionId) {
      try {
        const pending = pickTxnPendingSellerSig();
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

    // Create SELLER signing link
    let signLink: string | null = null;
    try {
      // TODO: If you do not have createSellerSignatureLink yet, add a helper in lib/trade
      // that mirrors createBuyerSignatureLink but uses the sellerToken and marks seller as signer[0].
      signLink = await createSellerSignatureLink(updated.id, updated.sellerToken as any);
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Failed to create seller sign URL",
          details: e?.message || "Unknown error",
          hint: "Check DROPBOX_SIGN_API_KEY / DROPBOX_SIGN_CLIENT_ID and sample file URL.",
        },
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
        select: { email: true, name: true, clerkId: true },
      }),
    ]);

    let buyerName = buyerLocal?.name || "Buyer";
    let sellerName = sellerLocal?.name || "Seller";
    let sellerEmail = sellerLocal?.email || "";

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

    if (sellerEmail) {
      // Minimal, robust HTML (use your template system if you prefer)
      const priceLabel = `$${(updated.pricePerAf / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}/AF`;

      const viewLinkForSeller = appUrl(
        `/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}&action=review`
      );

      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 12px">Action required: sign documents</h2>
          <p>Hello ${sellerName},</p>
          <p>${buyerName} accepted your terms. Please review and sign the agreement to proceed.</p>
          <ul>
            <li><strong>District:</strong> ${updated.district || "—"}</li>
            <li><strong>Water:</strong> ${updated.waterType || "—"}</li>
            <li><strong>Volume:</strong> ${updated.volumeAf} AF</li>
            <li><strong>Price:</strong> ${priceLabel}</li>
          </ul>
          <p>
            <a href="${signLink}" style="display:inline-block;background:#0a6b58;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">
              Review & Sign
            </a>
          </p>
          <p>If the button doesn’t work, copy and paste this URL into your browser:<br/>
            <a href="${signLink}">${signLink}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p>You can also view this offer here: <a href="${viewLinkForSeller}">${viewLinkForSeller}</a></p>
        </div>
      `;

      await sendEmail({
        to: sellerEmail,
        subject: "Signature requested — buyer accepted",
        html,
        preheader: "Please review and sign to continue.",
      });
    }

    // Friendly client hint/redirect
    return NextResponse.json({
      ok: true,
      tradeId: updated.id,
      status: updated.status,
      message: "Awaiting seller signature",
      signLink, // you might redirect the buyer to a “thanks” page instead
    });
  } catch (e: any) {
    console.error("[trades/:id/buyer/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
