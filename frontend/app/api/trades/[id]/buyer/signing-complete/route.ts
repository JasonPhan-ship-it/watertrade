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

function pickTxnAfterBuyerSig(): (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return TXS.COMPLIANCE_REVIEW ?? TXS.APPROVED ?? TXS.FUNDS_RELEASED ?? null;
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

function parseEmails(value?: string | null) {
  if (!value) return [] as string[];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function formatUsdCents(cents?: number | null) {
  if (typeof cents !== "number") return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
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
        listing: { select: { title: true, district: true } },
      },
    });

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (trade.buyerToken && token && token !== trade.buyerToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: pickFullyExecutedStatus(),
        buyerSignStatus: SignatureProgress.SIGNED,
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
        const nextStatus = pickTxnAfterBuyerSig();
        if (nextStatus) {
          await prisma.transaction.update({ where: { id: updated.transactionId }, data: { status: nextStatus } });
        }
      } catch (err) {
        console.warn("[buyer/signing-complete] transaction update failed", (err as any)?.message);
      }
    }

    const [buyerContact, sellerContact] = await Promise.all([
      resolveContact(updated.buyerUserId),
      resolveContact(updated.sellerUserId),
    ]);

    const tradeLinkForSeller = appUrl(
      `/t/${updated.id}?role=seller${updated.sellerToken ? `&token=${updated.sellerToken}` : ""}&action=buyer-signature-complete`
    );
    const tradeLinkForBuyer = appUrl(
      `/t/${updated.id}?role=buyer${updated.buyerToken ? `&token=${updated.buyerToken}` : ""}&action=buyer-signature-complete`
    );

    if (sellerContact.email) {
      const html = `
        <p>Hi ${sellerContact.name || "Seller"},</p>
        <p>The buyer just completed their signature. Our team will now review and coordinate with the water district.</p>
        <p>Track progress here: <a href="${tradeLinkForSeller}">${tradeLinkForSeller}</a></p>
      `;
      try {
        await sendEmail({ to: sellerContact.email, subject: "Buyer signed — pending admin review", html });
      } catch (err) {
        console.warn("[buyer/signing-complete] email seller failed", (err as any)?.message);
      }
    }

    if (buyerContact.email) {
      const html = `
        <p>Hi ${buyerContact.name || "Buyer"},</p>
        <p>Thanks for signing! Our team will confirm the agreement with the district and keep you posted.</p>
        <p>You can return to the transaction any time: <a href="${tradeLinkForBuyer}">${tradeLinkForBuyer}</a></p>
      `;
      try {
        await sendEmail({ to: buyerContact.email, subject: "Signature received — we’ll take it from here", html });
      } catch (err) {
        console.warn("[buyer/signing-complete] email buyer failed", (err as any)?.message);
      }
    }

    const adminEmails = parseEmails(process.env.ADMIN_NOTIFICATIONS_EMAIL);
    if (adminEmails.length) {
      const html = `
        <p>Trade ${updated.id} is fully signed.</p>
        <ul>
          <li>District: ${updated.district}</li>
          <li>Water type: ${updated.waterType ?? "—"}</li>
          <li>Volume (AF): ${updated.volumeAf}</li>
          <li>Price/AF: ${formatUsdCents(updated.pricePerAf)}</li>
        </ul>
        <p><a href="${tradeLinkForSeller}">View trade in Water Traders</a></p>
      `;
      try {
        await sendEmail({ to: adminEmails, subject: `Trade ${updated.id} ready for admin review`, html });
      } catch (err) {
        console.warn("[buyer/signing-complete] admin email failed", (err as any)?.message);
      }
    }

    const districtEmails = parseEmails(process.env.DISTRICT_NOTIFICATIONS_EMAIL);
    if (districtEmails.length) {
      const html = `
        <p>The buyer and seller have both signed trade ${updated.id} for ${updated.district}.</p>
        <p>Please review and confirm the transfer in your system.</p>
      `;
      try {
        await sendEmail({ to: districtEmails, subject: `Action needed: trade ${updated.id} pending district confirmation`, html });
      } catch (err) {
        console.warn("[buyer/signing-complete] district email failed", (err as any)?.message);
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
