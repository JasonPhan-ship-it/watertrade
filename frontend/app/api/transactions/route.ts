// app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";
import { getOrCreateUserFromClerk } from "@/lib/clerk";
import { ListingStatus, Party, TradeStatus, TransactionStatus, TransactionType } from "@prisma/client";

export const runtime = "nodejs";

type TType = "BUY_NOW" | "OFFER";

function toPositiveInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 ? rounded : null;
}

function normalizeCents(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function normalizePriceToCents(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;

  const str = typeof v === "string" ? v.trim() : "";
  const hasExplicitDecimal = str.includes(".");
  const hasFraction = !Number.isInteger(n);

  const treatAsDollars = hasExplicitDecimal || hasFraction || Math.abs(n) < 1_000;
  return treatAsDollars ? Math.round(n * 100) : Math.round(n);
}

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const me = await getOrCreateUserFromClerk(clerkId);
    const body = await req.json();

    const listingId = String(body?.listingId || "");
    const rawType: string = String(body?.type || "");
    const type = (rawType.toUpperCase() as TType) || null;

    const buyerWaterAccount =
      typeof body?.buyerWaterAccount === "string" ? body.buyerWaterAccount.trim() : "";
    
    // numbers may come as strings
    const qty = toPositiveInt(body?.acreFeet ?? body?.volumeAF ?? body?.volumeAf);

    const centsSources = [
      body?.pricePerAFCents,
      body?.pricePerAfCents,
      body?.price_per_af_cents,
    ];
    let pricePerAfCents: number | null = null;
    for (const candidate of centsSources) {
      const normalized = normalizeCents(candidate);
      if (normalized != null) {
        pricePerAfCents = normalized;
        break;
      }
    }

    if (pricePerAfCents == null) {
      const priceCandidates = [body?.pricePerAF, body?.pricePerAf, body?.price_per_af];
      for (const candidate of priceCandidates) {
        const normalized = normalizePriceToCents(candidate);
        if (normalized != null) {
          pricePerAfCents = normalized;
          break;
        }
      }
    }

    // Validate payload
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    if (type !== "BUY_NOW" && type !== "OFFER") {
      return NextResponse.json({ error: 'type must be "BUY_NOW" or "OFFER"' }, { status: 400 });
    }
    if (!qty || qty < 1) {
      return NextResponse.json({ error: "acreFeet must be a positive integer" }, { status: 400 });
    }
    if (!pricePerAfCents || pricePerAfCents < 1) {
      return NextResponse.json({ error: "pricePerAF must be a positive number (cents or dollars)" }, { status: 400 });
    }

    const totalAmount = qty * pricePerAfCents; // cents

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        status: true,
        district: true,
        waterType: true,
        sellerFarmId: true,
        seller: { select: { id: true, email: true, name: true } },
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId || !listing.seller) {
      return NextResponse.json({ error: "Listing has no seller assigned" }, { status: 400 });
    }

    if (listing.status && listing.status !== ListingStatus.ACTIVE) {
      return NextResponse.json(
        { error: "This listing is no longer available for new transactions." },
        { status: 409 }
      );
    }

    if (type === "BUY_NOW") {
      const existingBuyNow = await prisma.transaction.findFirst({
        where: {
          listingId,
          type: TransactionType.BUY_NOW,
          status: { not: TransactionStatus.CANCELLED },
        },
        select: { id: true },
      });
      if (existingBuyNow) {
        return NextResponse.json(
          { error: "A Buy Now purchase already exists for this listing." },
          { status: 409 }
        );
      }
    }

    // Create the transaction
    const trx = await prisma.transaction.create({
      data: {
        listingId,
        buyerId: me.id,
        sellerId: listing.sellerId,
        type,                 // "BUY_NOW" | "OFFER"
        acreFeet: qty,
        pricePerAF: pricePerAfCents, // cents
        totalAmount,          // cents
        buyerWaterAccount: buyerWaterAccount || null,
        sellerFarmId: listing.sellerFarmId ?? null,
      },
      select: { id: true, type: true },
    });

    if (type === "OFFER") {
      try {
        await prisma.trade.create({
          data: {
            transactionId: trx.id,
            listingId,
            sellerUserId: listing.sellerId,
            buyerUserId: me.id,
            district: listing.district,
            waterType: listing.waterType ?? null,
            volumeAf: qty,
            pricePerAf: pricePerAfCents,
            status: TradeStatus.OFFERED,
            round: 1,
            lastActor: Party.BUYER,
            events: {
              create: {
                actor: "buyer",
                kind: "OFFER",
                payload: { pricePerAf: pricePerAfCents, volumeAf: qty, round: 1 },
              },
            },
          },
        });
      } catch (tradeErr: any) {
        if (tradeErr?.code !== "P2002") {
          console.error("POST /api/transactions trade create failed", tradeErr);
          throw tradeErr;
        }
      }
    }

    // Email seller
    if (listing.seller.email) {
      const isOffer = type === "OFFER";
      const subject = isOffer
        ? `Offer received${listing.title ? ` — ${listing.title}` : ""}`
        : `Buy Now started${listing.title ? ` — ${listing.title}` : ""}`;

      // Prefill role + action so the page shows the seller actions immediately.
      const transactionUrl = appUrl(`/transactions/${trx.id}?role=seller&action=review`);

      // Numbers for display
      const priceUsd = (pricePerAfCents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const totalUsd = (totalAmount / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      // Branded, bulletproof(ish) green button with inline styles for email clients.
      const html = `
  <div style="margin:0;padding:0;background:#f6f9f8">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9f8;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;box-shadow:0 1px 2px rgba(0,0,0,0.04);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#004434;border-radius:16px 16px 0 0;">
                <div style="color:#ffffff;font-weight:700;font-size:16px;letter-spacing:0.2px;">Water Traders</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <h2 style="margin:0 0 6px 0;font-size:18px;line-height:1.3;color:#0f172a;">
                  ${isOffer ? "Offer Received" : "Buy Now Initiated"}
                </h2>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">
                  A buyer ${isOffer ? "submitted an offer" : "started a Buy Now"} on your listing${listing.title ? ` <strong>“${escapeHtml(listing.title)}”</strong>` : ""}.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 16px 0;">
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding:4px 0;width:160px;">Transaction ID</td>
                    <td style="font-size:13px;color:#0f172a;padding:4px 0;"><strong>${trx.id}</strong></td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding:4px 0;">Quantity (AF)</td>
                    <td style="font-size:13px;color:#0f172a;padding:4px 0;"><strong>${qty.toLocaleString()}</strong></td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding:4px 0;">Price ($/AF)</td>
                    <td style="font-size:13px;color:#0f172a;padding:4px 0;"><strong>$${priceUsd}</strong></td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding:4px 0;">Total</td>
                    <td style="font-size:13px;color:#0f172a;padding:4px 0;"><strong>$${totalUsd}</strong></td>
                  </tr>
                </table>

                <!-- Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px 0;">
                  <tr>
                    <td align="left">
                      <!--[if mso]>
                        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${transactionUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="20%" stroke="f" fillcolor="#0E6A59">
                          <w:anchorlock/>
                          <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:700;">
                            Open transaction
                          </center>
                        </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-->
                      <a href="${transactionUrl}" target="_blank"
                        style="
                          display:inline-block;
                          text-decoration:none;
                          background:linear-gradient(90deg,#0E6A59,#004434);
                          color:#ffffff;
                          font-weight:700;
                          font-size:14px;
                          line-height:20px;
                          padding:12px 18px;
                          border-radius:12px;
                          border:1px solid #004434;
                          box-shadow:0 1px 2px rgba(0,0,0,0.05);
                        ">
                        Open transaction
                      </a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                </table>

                <p style="margin:10px 0 0 0;font-size:12px;color:#64748b;">
                  Having trouble? Paste this link into your browser:<br />
                  <span style="word-break:break-all;color:#0f172a;">${transactionUrl}</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;border-top:1px solid #e5e7eb;border-radius:0 0 16px 16px;">
                <div style="font-size:12px;color:#94a3b8;">
                  © ${new Date().getFullYear()} Water Traders
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`.trim();

      await sendEmail({
        to: listing.seller.email,
        subject,
        html,
        // plaintext fallback
        text:
          `${isOffer ? "Offer received" : "Buy Now started"} on your listing${listing.title ? ` "${listing.title}"` : ""}\n\n` +
          `Transaction ID: ${trx.id}\n` +
          `Quantity (AF): ${qty}\n` +
          `Price ($/AF): $${priceUsd}\n` +
          `Total: $${totalUsd}\n\n` +
          `Open transaction: ${transactionUrl}\n`,
      });
    }

    return NextResponse.json({ id: trx.id, type: trx.type });
  } catch (err: any) {
    console.error("POST /api/transactions error:", err);
    const msg =
      typeof err?.message === "string" && err.message.length < 500
        ? err.message
        : "Failed to create transaction";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Tiny helper to avoid breaking HTML if titles have special chars
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
