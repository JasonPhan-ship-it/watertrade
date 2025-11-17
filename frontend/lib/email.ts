// lib/email.ts
/**
 * Resend sender + brand-styled HTML templates for the negotiation & signing flow.
 * Exports:
 *  - sendEmail
 *  - appUrl
 *  - renderSellerOfferEmail
 *  - renderBuyerAcceptedEmail
 *  - renderBuyerCounterEmail
 *  - renderSellerCounterEmail
 *  - renderBuyerDeclinedEmail
 *  - renderDocsKickoffEmail
 *  - renderSellerDocsReadyPurchasedEmail   <-- For Buy Now SELLER
 *  - renderSellerNeedsSignatureEmail
 *  - renderBuyerSignatureRequestEmail
 *  - renderBuyerSignedAckEmail
 *  - renderFullyExecutedEmail
 *  - renderDistrictApprovalEmail
 *  - renderBuyerPaymentRequestEmail
 *  - renderBuyerPurchasedEmail             <-- NEW For Buy Now BUYER
 *  - sendPurchaseEmails                    <-- NEW One-call helper
 *  - renderAdminPromotionEmail
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/* ---------------- Brand ---------------- */
const BRAND = {
  name: "Water Traders",
  greenDark: "#004434",
  greenMid: "#0E6A59",
  slate900: "#0f172a",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  font:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol", sans-serif',
};

/* -------------- Utilities -------------- */
type EmailAddress = string;

export type SendEmailOptions = {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  text?: string;
  preheader?: string;
  from?: EmailAddress;
  replyTo?: EmailAddress | EmailAddress[];
  cc?: EmailAddress | EmailAddress[];
  bcc?: EmailAddress | EmailAddress[];
  idempotencyKey?: string;
  timeoutMs?: number;
  // Resend expects base64 `content`. If you pass `path`, we ignore it (serverless friendly).
  attachments?: Array<{ filename: string; content: string; contentType?: string; path?: string }>;
};

function ensureArray<T>(v?: T | T[]) {
  if (v == null) return undefined;
  return Array.isArray(v) ? (v.length ? v : undefined) : [v];
}
function isValidFromAddress(v: string) {
  const simple = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nameAddr = /^.+\s<[^<>@\s]+@[^<>@\s]+\.[^\s<>@]+>$/;
  return simple.test(v) || nameAddr.test(v);
}
function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
}

/** Build absolute app URLs safely. */
export function appUrl(path = "/") {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    process.env.APP_URL ||
    "http://localhost:3000";
  const base = envBase.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/* --- Safety rail: normalize any seller sign link to the DocuSign *creator/redirector* endpoint --- */
function extractTxIdFromUrl(u: string) {
  try {
    const url = new URL(u, appUrl("/"));
    // /transactions/<id>#sign
    const m1 = url.pathname.match(/\/transactions\/([^/]+)/)?.[1];
    if (m1) return m1;
    // /api/signing/seller?tx=<id>
    const txParam = url.searchParams.get("tx");
    if (txParam) return txParam;
    // /api/sign-url?id=<id>
    const idParam = url.searchParams.get("id");
    if (idParam) return idParam;
    return null;
  } catch {
    return null;
  }
}

/**
 * Always return /api/sign-url?id=<txId>&role=seller&redirect=1
 * so we create the envelope on-demand and 302 to DocuSign.
 */
function coerceSellerSignLink(signLink: string): string {
  const txId =
    extractTxIdFromUrl(signLink) ||
    // last-ditch split if someone passed a bare tx param
    signLink.split("tx=").pop()?.split("&")[0] ||
    signLink.split("id=").pop()?.split("&")[0] ||
    "";

  if (txId) {
    return appUrl(`/api/sign-url?id=${txId}&role=seller&redirect=1`);
  }
  return signLink;
}

function coerceBuyerSignLink(signLink: string): string {
  const txId =
    extractTxIdFromUrl(signLink) ||
    signLink.split("tx=").pop()?.split("&")[0] ||
    signLink.split("id=").pop()?.split("&")[0] ||
    "";

  if (txId) {
    return appUrl(`/api/sign-url?id=${txId}&role=buyer&redirect=1`);
  }
  return signLink;
}

/* --------------- Sender ---------------- */
export async function sendEmail(opts: SendEmailOptions): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM;

  // Helpful soft-fail in dev/preview if email isn’t configured.
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing; skipping email send:", {
      to: opts.to,
      subject: opts.subject,
    });
    return {};
  }

  const from = opts.from ?? defaultFrom;
  if (!from) throw new Error("EMAIL_FROM is required (e.g., 'Water Traders <no-reply@yourdomain.com>').");
  if (!isValidFromAddress(from)) throw new Error(`EMAIL_FROM invalid format: ${from}`);

  const to = ensureArray(opts.to);
  if (!to?.length) throw new Error("sendEmail: 'to' is required.");

  const body: Record<string, unknown> = {
    from,
    to,
    subject: opts.subject,
    html: withPreheader(opts.html, opts.preheader),
    text: opts.text ?? stripHtml(opts.html),
  };

  const replyTo = ensureArray(opts.replyTo);
  const cc = ensureArray(opts.cc);
  const bcc = ensureArray(opts.bcc);

  if (replyTo) body.reply_to = replyTo;
  if (cc) body.cc = cc;
  if (bcc) body.bcc = bcc;

  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content, // base64
      ...(a.contentType ? { contentType: a.contentType } : {}),
    }));
  }

  const timeoutMs = opts.timeoutMs ?? 15000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: ctrl.signal,
  }).finally(() => clearTimeout(timer));

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 422 && text.includes("Invalid `from` field"))
      throw new Error(`Resend 422 invalid 'from' field. Response: ${text}`);
    if (res.status === 429) throw new Error(`Resend 429 rate limited. Response: ${text}`);
    throw new Error(`Resend error ${res.status}: ${text || res.statusText}`);
  }

  try {
    const json: any = await res.json();
    return { id: json?.id };
  } catch {
    return {};
  }
}

/* -------------- Layout -------------- */
function withPreheader(html: string, preheader?: string) {
  if (!preheader) return html;
  const hidden = `<div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>`;
  return hidden + html;
}

type Cta = { label: string; href: string; primary?: boolean };
type KeyValue = { label: string; value: string };

function brandLogoUrl() {
  // Kept for compatibility; header no longer shows a logo per design spec.
  return process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || appUrl("/brand-email.png");
}

/** Format cents into $X.XX/AF */
function formatUsdPerAf(cents: number) {
  const dollars = (cents ?? 0) / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/AF`;
}

/** Format cents-per-AF and volume into a total dollars label */
function formatUsdTotal(centsPerAf: number, volumeAf: number) {
  const totalDollars = ((centsPerAf ?? 0) * (volumeAf ?? 0)) / 100;
  return `$${totalDollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderEmailLayout(params: {
  title: string;
  subtitle?: string;
  intro?: string;
  keyValues?: KeyValue[];
  ctas?: Cta[];
  footerNote?: string;
  logoUrl?: string; // optional brand logo for header
}): string {
  const { title, subtitle, intro, keyValues = [], ctas = [], footerNote, logoUrl } = params;

  const btn = (c: Cta, addRightMargin = false) => {
    const baseStyles = c.primary
      ? `background: linear-gradient(90deg, ${BRAND.greenMid}, ${BRAND.greenDark}); color:#fff; border:1px solid ${BRAND.greenDark};`
      : `background:#fff; color:${BRAND.greenDark}; border:1px solid ${BRAND.greenDark};`;
    const extra = addRightMargin ? "margin-right:12px;" : "";
    return `<a href="${c.href}" target="_blank" style="display:inline-block;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:12px;${baseStyles}${extra}">${escapeHtml(
      c.label
    )}</a>`;
  };

  const kv = (kv: KeyValue) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.slate200};color:${BRAND.slate600};font-size:13px;width:40%;">${escapeHtml(
        kv.label
      )}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.slate200};color:${BRAND.slate900};font-size:13px;">${escapeHtml(
        kv.value
      )}</td>
    </tr>`;

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.slate100};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border-radius:16px;border:1px solid ${BRAND.slate200};overflow:hidden;">
        <!-- Header banner: text-only, bold white "Water Traders" -->
        <tr>
          <td style="padding:18px 20px;background:linear-gradient(90deg, ${BRAND.greenDark}, ${BRAND.greenMid});">
            <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="left">
                  ${
                    logoUrl
                      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(BRAND.name)} logo" style="max-height:26px;max-width:180px;display:block;" />`
                      : `<span style="font-family:${BRAND.font};color:#fff;font-size:16px;font-weight:700;letter-spacing:.2px;">${BRAND.name}</span>`
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 28px 8px;">
            <div style="font-family:${BRAND.font};color:${BRAND.slate900};font-size:20px;font-weight:700;">${escapeHtml(
              title
            )}</div>
            ${subtitle ? `<div style="margin-top:6px;font-family:${BRAND.font};color:${BRAND.slate600};font-size:13px;">${escapeHtml(
              subtitle
            )}</div>` : ""}
          </td>
        </tr>

        <tr>
          <td style="padding:0 28px 8px;">
            <table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${BRAND.slate200};border-radius:12px;">
              ${
                intro
                  ? `<tr><td style="padding:16px 16px 0;font-family:${BRAND.font};color:${BRAND.slate700};font-size:14px;line-height:1.5;">${escapeHtml(
                      intro
                    )}</td></tr>`
                  : ""
              }
              ${
                keyValues.length
                  ? `<tr><td style="padding:12px 0 0;">
                       <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
                         ${keyValues.map(kv).join("")}
                       </table>
                     </td></tr>`
                  : ""
              }
              ${
                ctas.length
                  ? `<tr><td style="padding:16px;text-align:left;">
                       <div style="display:inline-flex;gap:14px;flex-wrap:wrap;">
                         ${ctas.map((c, i) => btn(c, i === 0)).join("")}
                       </div>
                     </td></tr>`
                  : ""
              }
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 24px;">
            <div style="font-family:${BRAND.font};color:${BRAND.slate500};font-size:12px;line-height:1.5;">
              ${escapeHtml(
                footerNote ||
                  `You’re receiving this because you have an active account with ${BRAND.name}.`
              )}<br/>
              <span>© ${new Date().getFullYear()} ${BRAND.name}, LLC</span><br/>
              <a href="${appUrl("/billing")}" style="color:${BRAND.greenDark};text-decoration:underline;">Manage billing</a>
              &nbsp;•&nbsp;
              <a href="${appUrl("/settings/notifications")}" style="color:${BRAND.greenDark};text-decoration:underline;">Notification settings</a>
            </div>
          </td>
        </tr>
      </table>
      <div style="height:20px;line-height:20px;">&nbsp;</div>
    </td></tr>
  </table>`;
}

/* --------- Negotiation Templates --------- */

type OfferSummary = {
  listingTitle: string;
  district: string;
  waterType?: string | null;
  volumeAf: number;
  pricePerAf: number;  // cents
  priceLabel?: string; // optional preformatted
  windowLabel?: string;
};
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

const DEFAULT_LOGO = brandLogoUrl(); // no longer shown, kept for compatibility

/** Email to SELLER when a new offer (or buyer counter) arrives */
export function renderSellerOfferEmail(params: {
  sellerName?: string | null;
  buyerName?: string | null;
  offer: OfferSummary;
  viewLink: string;
  acceptLink: string;
  counterLink: string;
}) {
  const { sellerName, buyerName, offer, viewLink, acceptLink, counterLink } = params;
  const html = renderEmailLayout({
    title: "You’ve received an offer",
    subtitle: sellerName ? `Hi ${sellerName}, a buyer is interested.` : "A buyer is interested.",
    intro: buyerName
      ? `${buyerName} sent terms. Review and choose Accept or Counter.`
      : `Review the offer and choose Accept or Counter.`,
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Accept Offer", href: acceptLink, primary: true },
      { label: "Counter Offer", href: counterLink },
      { label: "View Details", href: viewLink },
    ],
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "New offer received—review and respond." };
}

/** Email to BUYER when seller accepts → buyer must sign */
export function renderBuyerAcceptedEmail(params: {
  buyerName?: string | null;
  sellerName?: string | null;
  offer: OfferSummary;
  signLink: string;
  viewLink?: string;
}) {
  const { buyerName, sellerName, offer, signLink, viewLink } = params;
  const html = renderEmailLayout({
    title: "Offer accepted 🎉",
    subtitle: buyerName ? `Hi ${buyerName}, your offer was accepted.` : "Your offer was accepted.",
    intro: sellerName
      ? `Please review and sign.`
      : "The seller accepted your offer. Please review and sign.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Review & Sign", href: signLink, primary: true },
      ...(viewLink ? [{ label: "View Details", href: viewLink }] : []),
    ],
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "Seller accepted—please review and sign." };
}

/** Email to BUYER when seller counters */
export function renderBuyerCounterEmail(params: {
  buyerName?: string | null;
  sellerName?: string | null;
  offer: OfferSummary;
  viewLink: string;
  counterLink: string;
  declineLink: string;
}) {
  const { buyerName, sellerName, offer, viewLink, counterLink, declineLink } = params;
  const html = renderEmailLayout({
    title: "Seller sent a counteroffer",
    subtitle: buyerName ? `Hi ${buyerName}, you have a counteroffer.` : "You have a counteroffer.",
    intro: sellerName
      ? `${sellerName} countered your offer. Review the terms and respond.`
      : "The seller countered your offer. Review the terms and respond.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Make a Counter", href: counterLink, primary: true },
      { label: "Decline", href: declineLink },
      { label: "View Details", href: viewLink },
    ],
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "Counteroffer received—review and respond." };
}

/** Email to SELLER when buyer counters */
export function renderSellerCounterEmail(params: {
  sellerName?: string | null;
  buyerName?: string | null;
  offer: OfferSummary;
  viewLink: string;
  counterLink: string;
  declineLink: string;
}) {
  const { sellerName, buyerName, offer, viewLink, counterLink, declineLink } = params;
  const html = renderEmailLayout({
    title: "Buyer sent a counteroffer",
    subtitle: sellerName ? `Hi ${sellerName}, you have a counteroffer.` : "You have a counteroffer.",
    intro: buyerName
      ? `${buyerName} countered your offer. Review the terms and respond.`
      : "The buyer countered your offer. Review the terms and respond.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Make a Counter", href: counterLink, primary: true },
      { label: "Decline", href: declineLink },
      { label: "View Details", href: viewLink },
    ],
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "Counteroffer received—review and respond." };
}

/** Email to SELLER when buyer declines (FYI) */
export function renderBuyerDeclinedEmail(params: {
  buyerName?: string | null;
  sellerName?: string | null;
  offer: OfferSummary;
  viewLink?: string;
}) {
  const { buyerName, sellerName, offer, viewLink } = params;
  const html = renderEmailLayout({
    title: "Offer declined",
    subtitle: sellerName ? `Hi ${sellerName}, the buyer declined.` : "The buyer declined.",
    intro: buyerName
      ? `${buyerName} declined the offer. You can explore other opportunities.`
      : "The buyer declined the offer.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      ...(viewLink ? [{ label: "View Listing", href: viewLink, primary: true }] : []),
      { label: "Browse Listings", href: appUrl("/listings") },
    ],
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "Offer declined—browse similar opportunities." };
}

/** Branded email for doc/signature kickoff (generic).
 * For Buy Now, prefer renderSellerDocsReadyPurchasedEmail instead. */
export function renderDocsKickoffEmail(params: {
  title: string;
  subtitle?: string;
  intro?: string;
  offer: {
    listingTitle: string;
    district: string;
    waterType?: string | null;
    volumeAf: number;
    pricePerAf: number;          // cents
    priceLabel?: string;         // optional override
    windowLabel?: string;
  };
  ctas: { label: string; href: string; primary?: boolean }[];
  footerNote?: string;
}) {
  const { title, subtitle, intro, offer, ctas, footerNote } = params;

  const keyValues: { label: string; value: string }[] = [
    { label: "Listing", value: offer.listingTitle },
    { label: "District", value: offer.district },
    ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
    { label: "Volume (AF)", value: new Intl.NumberFormat("en-US").format(offer.volumeAf) },
    { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
    ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
  ];

  const html = renderEmailLayout({
    title,
    subtitle,
    intro,
    keyValues,
    ctas,
    footerNote,
    logoUrl: DEFAULT_LOGO,
  });

  return { html, preheader: subtitle || intro || title };
}

/* ---------------- Additional signing-phase emails ---------------- */

/** SELLER → docs ready after the BUYER uses Buy Now (explicit purchase mention) */
export function renderSellerDocsReadyPurchasedEmail(params: {
  sellerName?: string | null;
  buyerName?: string | null;
  offer: OfferSummary;
  signLink: string;     // can be any form; coerced to /api/sign-url?id=:id&role=seller&redirect=1
  viewLink?: string;    // optional details link
}) {
  const { sellerName, buyerName, offer, signLink, viewLink } = params;
  const safeSignLink = coerceSellerSignLink(signLink);
  const price = offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf);
  const buyerDisplay = buyerName?.trim() || "A buyer";

  const html = renderEmailLayout({
    title: "Buyer purchased at your set price — documents ready to sign",
    subtitle: sellerName ? `Hi ${sellerName},` : undefined,
    intro:
      `${buyerDisplay} just bought your water for ${price} on “${offer.listingTitle}.” ` +
      `Please review and sign to continue.`,
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: price },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Review & Sign", href: safeSignLink, primary: true },
      ...(viewLink ? [{ label: "View Details", href: viewLink }] : []),
    ],
    logoUrl: DEFAULT_LOGO,
  });

  return {
    html,
    preheader: "Buyer purchased at your set price — please review and sign.",
  };
}

/** SELLER → needs to sign after the BUYER signs */
export function renderSellerNeedsSignatureEmail(params: {
  sellerName?: string | null;
  buyerName?: string | null;
  offer: OfferSummary;
  signLink: string;     // coerced to /api/sign-url?id=:id&role=seller&redirect=1
  viewLink?: string;    // optional details link
}) {
  const { sellerName, buyerName, offer, signLink, viewLink } = params;
  const safeSignLink = coerceSellerSignLink(signLink);

  const html = renderEmailLayout({
    title: "Please review & sign",
    subtitle: sellerName ? `Hi ${sellerName}, it’s your turn to sign.` : "It’s your turn to sign.",
    intro: buyerName
      ? `${buyerName} has completed their part. Please review and sign to proceed.`
      : "The buyer has completed their part. Please review and sign to proceed.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Review & Sign", href: safeSignLink, primary: true },
      ...(viewLink ? [{ label: "View Details", href: viewLink }] : []),
    ],
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "Your signature is requested." };
}

export function renderBuyerSignatureRequestEmail(params: {
  buyerName?: string | null;
  sellerName?: string | null;
  offer: OfferSummary;
  signLink: string;
  viewLink?: string;
}) {
  const { buyerName, sellerName, offer, signLink, viewLink } = params;
  const safeSignLink = coerceBuyerSignLink(signLink);

  const html = renderEmailLayout({
    title: "Please sign to confirm your purchase",
    subtitle: buyerName
      ? `Hi ${buyerName}, please review & sign to lock in your purchase.`
      : "Please review & sign to lock in your purchase.",
    keyValues: [
      {
        label: "District",
        value: [
          offer.district,
          offer.waterType,
          `${fmt(offer.volumeAf)} AF`,
          formatUsdTotal(offer.pricePerAf, offer.volumeAf),
        ]
          .filter(Boolean)
          .join(" • "),
      },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Review & Sign", href: safeSignLink, primary: true },
      ...(viewLink ? [{ label: "View Details", href: viewLink }] : []),
    ],
    logoUrl: DEFAULT_LOGO,
  });

  return { html, preheader: "Please sign to continue your purchase." };
}

/** BUYER → immediate acknowledgement after signing (your webhook may attach the PDF) */
export function renderBuyerSignedAckEmail(params: {
  buyerName?: string | null;
  sellerName?: string | null;
  offer: OfferSummary;
  viewLink?: string;
}) {
  const { buyerName, sellerName, offer, viewLink } = params;
  const html = renderEmailLayout({
    title: "We’ve recorded your signature",
    subtitle: buyerName
      ? `Thanks, ${buyerName}.`
      : "Thanks for signing.",
    intro: sellerName
      ? `We’ve notified ${sellerName} to sign next. We’ll email you once the agreement is fully executed.`
      : "We’ve notified the seller to sign next. We’ll email you once the agreement is fully executed.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      ...(viewLink ? [{ label: "View Details", href: viewLink, primary: true }] : []),
    ],
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "Your signature has been recorded." };
}

/** BOTH PARTIES → final confirmation when envelope is fully executed (attach PDF in caller) */
export function renderFullyExecutedEmail(params: {
  recipientName?: string | null;
  counterpartName?: string | null;
  offer: OfferSummary;
  viewLink?: string;
}) {
  const { recipientName, counterpartName, offer, viewLink } = params;
  const html = renderEmailLayout({
    title: "Agreement fully executed 🎉",
    subtitle: recipientName
      ? `Hi ${recipientName}, both parties have signed.`
      : "Both parties have signed.",
    intro: counterpartName
      ? `You and ${counterpartName} have completed the agreement. Our team will follow up regarding the water transfer.`
      : "The agreement is fully executed. Our team will follow up regarding the water transfer.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      ...(viewLink ? [{ label: "View Agreement", href: viewLink, primary: true }] : []),
    ],
    footerNote:
      "A copy of the fully executed agreement is attached for your records. We’ll be in touch about conveyance and district steps.",
    logoUrl: DEFAULT_LOGO,
  });
  return { html, preheader: "Fully executed agreement attached." };
}

export function renderDistrictApprovalEmail(params: {
  districtName?: string | null;
  offer: OfferSummary;
  viewLink?: string;
}) {
  const { districtName, offer, viewLink } = params;
  const html = renderEmailLayout({
    title: "Water transfer ready for district review",
    subtitle: districtName
      ? `${districtName}, please review the attached agreement.`
      : "Please review the attached agreement.",
    intro:
      "Buyer and seller have signed the agreement. Please review the attached documents and confirm the transfer in your system.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: viewLink ? [{ label: "View in Water Traders", href: viewLink, primary: true }] : [],
    footerNote: "The fully executed agreement is attached to this email.",
    logoUrl: DEFAULT_LOGO,
  });

  return { html, preheader: "District review requested." };
}

export function renderBuyerPaymentRequestEmail(params: {
  buyerName?: string | null;
  sellerName?: string | null;
  offer: OfferSummary;
  paymentLink: string;
  viewLink?: string;
}) {
  const { buyerName, sellerName, offer, paymentLink, viewLink } = params;
  const html = renderEmailLayout({
    title: "Action needed: transfer funds",
    subtitle: buyerName ? `Hi ${buyerName}, the district has approved.` : "The district has approved.",
    intro: sellerName
      ? `${sellerName} has been notified. Please transfer the funds via Stripe Connect to complete the trade.`
      : "Please transfer the funds via Stripe Connect to complete the trade.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf) },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Transfer via Stripe Connect", href: paymentLink, primary: true },
      ...(viewLink ? [{ label: "View Trade", href: viewLink }] : []),
    ],
    logoUrl: DEFAULT_LOGO,
  });

  return { html, preheader: "Transfer funds to finish the trade." };
}

/* ---------------- BUY NOW: Buyer receipt (NEW) ---------------- */

/** BUYER → instant purchase confirmation (no signing required yet for buyer) */
export function renderBuyerPurchasedEmail(params: {
  buyerName?: string | null;
  sellerName?: string | null;
  offer: OfferSummary;
  dashboardLink?: string; // defaults to /dashboard
  viewLink?: string;      // optional transaction/details link
}) {
  const { buyerName, sellerName, offer, dashboardLink, viewLink } = params;
  const price = offer.priceLabel ?? formatUsdPerAf(offer.pricePerAf);

  const html = renderEmailLayout({
    title: "Purchase confirmed 🎉",
    subtitle: buyerName ? `Hi ${buyerName}, we’ve recorded your purchase.` : "We’ve recorded your purchase.",
    intro: sellerName
      ? `We’ve notified ${sellerName}. We’ll email you as documents progress.`
      : "We’ve notified the seller. We’ll email you as documents progress.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: price },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Go to Dashboard", href: dashboardLink || appUrl("/dashboard"), primary: true },
      ...(viewLink ? [{ label: "View Details", href: viewLink }] : []),
    ],
    logoUrl: DEFAULT_LOGO,
  });

  return { html, preheader: "Thanks for your purchase—details inside." };
}

export function renderAdminPromotionEmail(params: {
  name?: string | null;
  adminPortalUrl: string;
  promotedByName?: string | null;
  promotedByEmail?: string | null;
}) {
  const { name, adminPortalUrl, promotedByName, promotedByEmail } = params;
  const grantedBy = [promotedByName?.trim(), promotedByEmail?.trim()].filter(Boolean).join(" · ");
  const html = renderEmailLayout({
    title: "Admin access enabled",
    subtitle: name
      ? `Hi ${name}, your Water Traders account now has admin permissions.`
      : "Your Water Traders account now has admin permissions.",
    intro:
      "You can now review listings, manage users, and oversee transactions from the Water Traders admin dashboard.",
    ctas: [{ label: "Open admin dashboard", href: adminPortalUrl, primary: true }],
    keyValues: grantedBy ? [{ label: "Granted by", value: grantedBy }] : undefined,
    footerNote: "If you were not expecting this change, reply to this email or contact support@watertraders.com.",
  });

  return { html, preheader: "Your Water Traders account now has admin access." };
}

/* ---------------- BUY NOW: One-call sender (NEW) ---------------- */

export async function sendPurchaseEmails(params: {
  // Buyer
  buyerEmail: string;
  buyerName?: string | null;
  // Seller
  sellerEmail?: string | null;
  sellerName?: string | null;
  // Offer/Listing summary
  offer: OfferSummary;
  // Transaction + links
  transactionId: string;
  sellerSignLink?: string;  // any form; coerced to /api/sign-url?id=:id&role=seller&redirect=1
  buyerViewLink?: string;   // e.g. /transactions/:id
  sellerViewLink?: string;  // e.g. /transactions/:id
  buyerDashboardLink?: string; // defaults to /dashboard
}) {
  const {
    buyerEmail,
    buyerName,
    sellerEmail,
    sellerName,
    offer,
    transactionId,
    sellerSignLink,
    buyerViewLink,
    sellerViewLink,
    buyerDashboardLink,
  } = params;

  // Buyer: receipt
  const buyerTpl = renderBuyerPurchasedEmail({
    buyerName,
    sellerName,
    offer,
    dashboardLink: buyerDashboardLink,
    viewLink: buyerViewLink,
  });
  const buyerSubject = `Purchase confirmed: ${offer.listingTitle}`;
  const buyerIdem = `tx:${transactionId}:buyer-purchase`;

  const buyerSend = await sendEmail({
    to: buyerEmail,
    subject: buyerSubject,
    html: buyerTpl.html,
    preheader: buyerTpl.preheader,
    idempotencyKey: buyerIdem,
  });

  // Seller: docs ready
  let sellerSend: { id?: string } | undefined;
  if (sellerEmail) {
    const sellerTpl = renderSellerDocsReadyPurchasedEmail({
      sellerName,
      buyerName: buyerName || "Buyer",
      offer,
      signLink: sellerSignLink || appUrl(`/api/sign-url?id=${transactionId}&role=seller&redirect=1`),
      viewLink: sellerViewLink || buyerViewLink,
    });
    const sellerSubject = `Buyer purchased: ${offer.listingTitle}`;
    const sellerIdem = `tx:${transactionId}:seller-docs-ready`;

    sellerSend = await sendEmail({
      to: sellerEmail,
      subject: sellerSubject,
      html: sellerTpl.html,
      preheader: sellerTpl.preheader,
      idempotencyKey: sellerIdem,
    });
  }

  return {
    buyerEmailId: buyerSend.id,
    sellerEmailId: sellerSend?.id,
  };
}
