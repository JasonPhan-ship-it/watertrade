// app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";
import { getOrCreateUserFromClerk } from "@/lib/clerk";

export const runtime = "nodejs";

type TType = "BUY_NOW" | "OFFER";

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// If UI sends dollars, we upconvert to cents. If already cents (e.g., 65000), keep it.
function dollarsToCentsMaybe(v: number): number {
  return v < 10_000 ? Math.round(v * 100) : v;
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

    // numbers may come as strings
    const qty = toInt(body?.acreFeet);
    let p = toInt(body?.pricePerAF);

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
    if (!p || p < 1) {
      return NextResponse.json({ error: "pricePerAF must be a positive number (cents or dollars)" }, { status: 400 });
    }

    // Convert dollars -> cents if it looks like dollars
    p = dollarsToCentsMaybe(p);
    const totalAmount = qty * p; // cents

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        seller: { select: { id: true, email: true, name: true } },
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.sellerId || !listing.seller) {
      return NextResponse.json({ error: "Listing has no seller assigned" }, { status: 400 });
    }

    // Create the transaction
    const trx = await prisma.transaction.create({
      data: {
        listingId,
        buyerId: me.id,
        sellerId: listing.sellerId,
        type,                 // "BUY_NOW" | "OFFER"
        acreFeet: qty,
        pricePerAF: p,        // cents
        totalAmount,          // cents
      },
      select: { id: true, type: true },
    });

    // Email seller
    if (listing.seller.email) {
      const isOffer = type === "OFFER";
      const subject = isOffer
        ? `Offer received${listing.title ? ` — ${listing.title}` : ""}`
        : `Buy Now started${listing.title ? ` — ${listing.title}` : ""}`;

      // Prefill role + action so the page shows the seller actions immediately.
      const transactionUrl = appUrl(`/transactions/${trx.id}?role=seller&action=review`);

      // Numbers for display
      const priceUsd = (p / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const totalUsd = (totalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });

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
