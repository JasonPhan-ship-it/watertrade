import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SignatureProgress, TradeStatus, TransactionStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";

import { appUrl, renderBuyerAcceptedEmail, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createBuyerSignatureLink } from "@/lib/trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickAcceptedPendingBuyerStatus(): (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return (
    TS.ACCEPTED_PENDING_BUYER_SIGNATURE ??
    TS.ACCEPTED_PENDING_SIGNATURE ??
    TS.ACCEPTED ??
    TS.PENDING ??
    TS.OFFERED
  );
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = (params.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing trade id" }, { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("token") || "";

  try {
    const trade = await prisma.trade.findUnique({
      where: { id },
      include: {
        listing: { select: { title: true, district: true, waterType: true } },
      },
    });

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (trade.sellerToken && token && token !== trade.sellerToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const buyerSignLink = await createBuyerSignatureLink(trade.id, trade.buyerToken);

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: pickAcceptedPendingBuyerStatus(),
        sellerSignStatus: SignatureProgress.SIGNED,
        buyerSignStatus: SignatureProgress.REQUESTED,
        buyerSignUrl: buyerSignLink,
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
        const nextStatus = pickTxnPendingBuyerSig();
        const updateData: any = {
          buyerSignUrl: buyerSignLink,
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

    if (buyerEmail) {
      const { html, preheader } = renderBuyerAcceptedEmail({
        buyerName: buyerName || "Buyer",
        sellerName: sellerName || "Seller",
        offer: offerSummary,
        signLink: buyerSignLink,
        viewLink: appUrl(
          `/t/${updated.id}?role=buyer${updated.buyerToken ? `&token=${updated.buyerToken}` : ""}&action=awaiting-buyer-signature`
        ),
      });
      try {
        await sendEmail({ to: buyerEmail, subject: "Seller signed — your turn to sign", html, preheader });
      } catch (err) {
        console.warn("[seller/signing-complete] sendEmail buyer failed", (err as any)?.message);
      }
    }

    if (sellerEmail) {
      const html = `
        <p>Hi ${sellerName || "Seller"},</p>
        <p>Thanks for signing the agreement. We’ve alerted the buyer to sign next.</p>
        <p>You can monitor progress <a href="${appUrl(`/t/${updated.id}?role=seller${
          updated.sellerToken ? `&token=${updated.sellerToken}` : ""
        }`)}">on Water Traders</a>.</p>
      `;
      try {
        await sendEmail({ to: sellerEmail, subject: "Signature captured — awaiting buyer", html });
      } catch (err) {
        console.warn("[seller/signing-complete] sendEmail seller failed", (err as any)?.message);
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

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[seller/signing-complete] unexpected", err);
    const fallback = new URL(appUrl(`/t/${id}`));
    fallback.searchParams.set("action", "signing-error");
    fallback.searchParams.set("role", "seller");
    if (token) fallback.searchParams.set("token", token);
    return NextResponse.redirect(fallback);
  }
}
