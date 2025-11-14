import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SignatureProgress, TradeStatus, TransactionStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";

import {
  appUrl,
  sendEmail,
  renderSellerNeedsSignatureEmail,
  renderBuyerSignedAckEmail,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createSellerSignatureLink } from "@/lib/trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickPendingSellerStatus(): (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_SELLER_SIGNATURE ??
    TS.ACCEPTED_PENDING_SIGNATURE ??
    TS.ACCEPTED ??
    TS.PENDING ??
    TS.OFFERED
  );
}

function pickTxnPendingSellerSig(): (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return TXS.PENDING_SELLER_SIGNATURE ?? TXS.PENDING_SIGNATURE ?? TXS.PENDING ?? TXS.ACCEPTED ?? null;
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
      // swallow clerk lookup errors
    }
  }

  return { email, name };
}

async function handle(req: NextRequest, params: { id: string }) {
  const id = (params.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing trade id" }, { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("token") || "";

  try {
    const trade = await prisma.trade.findUnique({
      where: { id },
      include: {
        listing: { select: { title: true, district: true } },
      },
    });

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (trade.buyerToken && token && token !== trade.buyerToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sellerSignLink = await createSellerSignatureLink(trade.id, trade.sellerToken);

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: pickPendingSellerStatus(),
        buyerSignStatus: SignatureProgress.SIGNED,
        sellerSignStatus: SignatureProgress.REQUESTED,
        buyerSignUrl: null,
        sellerSignUrl: sellerSignLink,
        events: {
          create: {
            id: randomUUID(),
            actor: "buyer",
            kind: "BUYER_SIGNED",
            payload: {
              previousStatus: trade.status,
              buyerSignStatus: trade.buyerSignStatus,
            },
          },
        },
      },
      select: {
        id: true,
        buyerUserId: true,
        sellerUserId: true,
        buyerToken: true,
        sellerToken: true,
        district: true,
        waterType: true,
        windowLabel: true,
        volumeAf: true,
        pricePerAf: true,
        transactionId: true,
      },
    });

    if (updated.transactionId) {
      try {
        const nextStatus = pickTxnPendingSellerSig();
        const updateData: any = {
          buyerSignUrl: null,
          sellerSignUrl: sellerSignLink,
        };
        if (nextStatus) {
          updateData.status = nextStatus;
        }
        await prisma.transaction.update({ where: { id: updated.transactionId }, data: updateData });
      } catch (err) {
        console.warn("[buyer/signing-complete] transaction update failed", (err as any)?.message);
      }
    }

    const [buyerContact, sellerContact] = await Promise.all([
      resolveContact(updated.buyerUserId),
      resolveContact(updated.sellerUserId),
    ]);

    const offer = {
      listingTitle: trade.windowLabel || trade.listing?.title || `Trade ${updated.id}`,
      district: trade.district,
      waterType: trade.waterType,
      volumeAf: trade.volumeAf,
      pricePerAf: trade.pricePerAf,
      windowLabel: trade.windowLabel || undefined,
    };

    if (sellerContact.email) {
      const sellerViewLink = appUrl(
        `/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}&action=awaiting-seller-signature`
      );
      const { html, preheader } = renderSellerNeedsSignatureEmail({
        sellerName: sellerContact.name,
        buyerName: buyerContact.name,
        offer,
        signLink: sellerSignLink,
        viewLink: sellerViewLink,
      });
      try {
        await sendEmail({
          to: sellerContact.email,
          subject: "Buyer signed — your turn to sign",
          html,
          preheader,
        });
      } catch (err) {
        console.warn("[buyer/signing-complete] email seller failed", (err as any)?.message);
      }
    }

    if (buyerContact.email) {
      const buyerViewLink = appUrl(
        `/t/${updated.id}?role=buyer${updated.buyerToken ? `&token=${updated.buyerToken}` : ""}&action=buyer-signature-complete`
      );
      const { html, preheader } = renderBuyerSignedAckEmail({
        buyerName: buyerContact.name,
        sellerName: sellerContact.name,
        offer,
        viewLink: buyerViewLink,
      });
      try {
        await sendEmail({
          to: buyerContact.email,
          subject: "Signature received — we invited the seller",
          html,
          preheader,
        });
      } catch (err) {
        console.warn("[buyer/signing-complete] email buyer failed", (err as any)?.message);
      }
    }

    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redirectUrl = new URL(`/t/${updated.id}`, base);
    redirectUrl.searchParams.set("role", "buyer");
    redirectUrl.searchParams.set("action", "buyer-signature-complete");
    const redirectToken = token || updated.buyerToken;
    if (redirectToken) {
      redirectUrl.searchParams.set("token", redirectToken);
    }

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[buyer/signing-complete] unexpected", err);
    const fallback = new URL(appUrl(`/t/${id}`));
    fallback.searchParams.set("action", "signing-error");
    fallback.searchParams.set("role", "buyer");
    if (token) fallback.searchParams.set("token", token);
    return NextResponse.redirect(fallback);
  }
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  return handle(req, ctx.params);
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
    // Ignore body parsing issues; DocuSign may omit a body for GET-style redirects.
  }
  return handle(req, ctx.params);
}
