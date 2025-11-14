import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SignatureProgress, TradeStatus, TransactionStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";

import { appUrl, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickFullyExecutedStatus(): (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return TS.FULLY_EXECUTED ?? TS.ACCEPTED ?? TS.PENDING ?? TS.OFFERED;
}

function pickTxnAfterSellerSig(): (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return TXS.COMPLIANCE_REVIEW ?? TXS.APPROVED ?? TXS.FUNDS_RELEASED ?? null;
}

function pickTxnPendingBuyerSig(): (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return TXS.PENDING_BUYER_SIGNATURE ?? TXS.PENDING_SIGNATURE ?? TXS.PENDING ?? TXS.ACCEPTED ?? null;
}

async function resolveContact(userId?: string | null) {
  if (!userId) return { email: "", name: "" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, clerkId: true } });
  if (!user) return { email: "", name: "" };

  let { email = "", name = "" } = user;

  if ((!email || !name) && user.clerkId) {
    try {
      const clerkUser = await clerkClient.users.getUser(user.clerkId);
      name = name || clerkUser.firstName || clerkUser.username || "";
      const primary = clerkUser.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress;
      email = email || primary || clerkUser.emailAddresses?.[0]?.emailAddress || "";
    } catch {
      // ignore clerk failures
    }
  }

  return { email, name };
}

type HandleOptions = {
  respondWithJson?: boolean;
};

async function handle(
  req: NextRequest,
  { params }: { params: { id: string } },
  opts: HandleOptions = {}
) {
  const respondWithJson = opts.respondWithJson ?? false;
  const rawId = (params.id || "").trim();
  if (!rawId) {
    return NextResponse.json({ error: "Missing trade id" }, { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("token") || "";
  let resolvedId = rawId;

  try {
    let trade = await prisma.trade.findUnique({
      where: { id: rawId },
      include: {
        listing: { select: { title: true, district: true, waterType: true } },
      },
    });

    if (!trade) {
      trade = await prisma.trade.findFirst({
        where: { transactionId: rawId },
        include: {
          listing: { select: { title: true, district: true, waterType: true } },
        },
      });
    }

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    resolvedId = trade.id;

    if (trade.sellerToken && token && token !== trade.sellerToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: pickFullyExecutedStatus(),
        sellerSignStatus: SignatureProgress.SIGNED,
        buyerSignStatus: SignatureProgress.SIGNED,
        buyerSignUrl: null,
        sellerSignUrl: null,
        events: {
          create: {
            id: randomUUID(),
            actor: "seller",
            kind: "SELLER_SIGNED",
            payload: {
              previousStatus: trade.status,
              sellerSignStatus: trade.sellerSignStatus,
              buyerSignStatus: trade.buyerSignStatus,
            },
          },
        },
      },
      select: {
        id: true,
        buyerUserId: true,
        sellerUserId: true,
        sellerToken: true,
        buyerToken: true,
        district: true,
        windowLabel: true,
        waterType: true,
        volumeAf: true,
        pricePerAf: true,
        transactionId: true,
      },
    });

    if (updated.transactionId) {
      try {
        const nextStatus = pickTxnAfterSellerSig();
        const updateData: any = {
          buyerSignUrl: null,
          sellerSignUrl: null,
        };
        if (nextStatus) {
          updateData.status = nextStatus;
        }
        await prisma.transaction.update({
          where: { id: updated.transactionId },
          data: updateData,
        });
      } catch (err) {
        console.warn("[seller/signing-complete] transaction update failed", (err as any)?.message);
      }
    }

    const [{ email: buyerEmail, name: buyerName }, { email: sellerEmail, name: sellerName }] = await Promise.all([
      resolveContact(updated.buyerUserId),
      resolveContact(updated.sellerUserId),
    ]);

    const offerSummary = {
      listingTitle: trade.windowLabel || trade.listing?.title || "Offer",
      district: trade.district,
      waterType: trade.waterType ?? undefined,
      volumeAf: trade.volumeAf,
      pricePerAf: trade.pricePerAf,
      windowLabel: trade.windowLabel ?? undefined,
    };

    const tradeLinkSeller = appUrl(
      `/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}&action=seller-signature-complete`
    );
    const tradeLinkBuyer = appUrl(
      `/t/${updated.id}?role=buyer${updated.buyerToken ? `&token=${updated.buyerToken}` : ""}&action=seller-signature-complete`
    );

    if (buyerEmail) {
      const html = `
        <p>Hi ${buyerName || "Buyer"},</p>
        <p>The seller has signed. Our compliance team will review the agreement next.</p>
        <p>You can monitor progress here: <a href="${tradeLinkBuyer}">${tradeLinkBuyer}</a></p>
      `;
      try {
        await sendEmail({ to: buyerEmail, subject: "Seller signed — pending admin review", html });
      } catch (err) {
        console.warn("[seller/signing-complete] sendEmail buyer failed", (err as any)?.message);
      }
    }

    if (sellerEmail) {
      const html = `
        <p>Hi ${sellerName || "Seller"},</p>
        <p>We’ve captured your signature and notified the buyer. Our compliance team will review the agreement next.</p>
        <p>Track progress here: <a href="${tradeLinkSeller}">${tradeLinkSeller}</a></p>
      `;
      try {
        await sendEmail({ to: sellerEmail, subject: "Signature captured — pending admin review", html });
      } catch (err) {
        console.warn("[seller/signing-complete] sendEmail seller failed", (err as any)?.message);
      }
    }

    const adminRecipients = (process.env.ADMIN_NOTIFICATIONS_EMAIL || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (adminRecipients.length) {
      const html = `
        <p>Trade ${updated.id} is fully signed and ready for compliance review.</p>
        <ul>
          <li>District: ${offerSummary.district}</li>
          <li>Water type: ${offerSummary.waterType ?? "—"}</li>
          <li>Volume (AF): ${offerSummary.volumeAf}</li>
          <li>Price/AF: $${(offerSummary.pricePerAf / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
        </ul>
        <p><a href="${tradeLinkSeller}">View trade in Water Traders</a></p>
      `;
      try {
        await sendEmail({ to: adminRecipients, subject: `Trade ${updated.id} ready for compliance review`, html });
      } catch (err) {
        console.warn("[seller/signing-complete] admin email failed", (err as any)?.message);
      }
    }

    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redirectUrl = new URL(`/t/${updated.id}`, base);
    redirectUrl.searchParams.set("role", "seller");
    redirectUrl.searchParams.set("action", "seller-signature-complete");
    const redirectToken = token || updated.sellerToken;
    if (redirectToken) {
      redirectUrl.searchParams.set("token", redirectToken);
    }

    if (respondWithJson) {
      return NextResponse.json({ ok: true, redirectUrl: redirectUrl.toString() });
    }

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[seller/signing-complete] unexpected", err);
    const fallback = new URL(appUrl(`/t/${resolvedId}`));
    fallback.searchParams.set("action", "signing-error");
    fallback.searchParams.set("role", "seller");
    if (token) fallback.searchParams.set("token", token);
    if (respondWithJson) {
      return NextResponse.json({ ok: false, redirectUrl: fallback.toString() }, { status: 500 });
    }
    
    return NextResponse.redirect(fallback);
  }
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  return handle(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      await req.formData();
    } else if (contentType.includes("application/json")) {
      await req.json();
    }
  } catch {
    // Ignore parsing errors; DocuSign can send empty bodies.
  }
  return handle(req, ctx, { respondWithJson: true });
}
