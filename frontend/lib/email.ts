// lib/email.ts
/**
 * Resend sender + brand-styled HTML templates for the negotiation flow.
 * Exports:
 *  - sendEmail
 *  - appUrl
 *  - renderSellerOfferEmail
 *  - renderBuyerAcceptedEmail
 *  - renderBuyerCounterEmail
 *  - renderBuyerDeclinedEmail
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
  attachments?: Array<{ filename: string; content: string; path?: string; contentType?: string }>;
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

/* --------------- Sender ---------------- */
export async function sendEmail(opts: SendEmailOptions): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM;
  if (!apiKey) {
    console.warn("RESEND_API_KEY missing; skipping email send.");
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
  if (opts.attachments?.length) body.attachments = opts.attachments;

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

function renderEmailLayout(params: {
  title: string;
  subtitle?: string;
  intro?: string;
  keyValues?: KeyValue[];
  ctas?: Cta[];
  footerNote?: string;
  logoUrl?: string;
}): string {
  const { title, subtitle, intro, keyValues = [], ctas = [], footerNote, logoUrl } = params;

  const btn = (c: Cta) => {
    const styles = c.primary
      ? `background: linear-gradient(90deg, ${BRAND.greenMid}, ${BRAND.greenDark}); color:#fff; border:1px solid ${BRAND.greenDark};`
      : `background:#fff; color:${BRAND.greenDark}; border:1px solid ${BRAND.greenDark};`;
    return `<a href="${c.href}" target="_blank" style="display:inline-block;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:12px;${styles}">${escapeHtml(
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
        <tr>
          <td style="padding:18px 20px;background:linear-gradient(90deg, ${BRAND.greenDark}, ${BRAND.greenMid});">
            <table width="100%"><tr><td align="left">
              <div style="display:flex;align-items:center;gap:10px;">
                ${logoUrl ? `<img src="${logoUrl}" alt="${BRAND.name}" width="36" height="36" style="border:none;border-radius:8px;vertical-align:middle;display:inline-block;" />` : ""}
                <span style="font-family:${BRAND.font};color:#fff;font-size:16px;font-weight:700;letter-spacing:.2px;">${BRAND.name}</span>
              </div>
            </td></tr></table>
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
                       <div style="display:inline-flex;gap:10px;flex-wrap:wrap;">
                         ${ctas.map(btn).join("")}
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

/* --------- Negotiation Templates (the ones your routes import) --------- */

type OfferSummary = {
  listingTitle: string;
  district: string;
  waterType?: string | null;
  volumeAf: number;
  pricePerAf: number;
  priceLabel?: string;
  windowLabel?: string;
};
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

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
      { label: "Price", value: offer.priceLabel ?? `$${fmt(offer.pricePerAf)}/AF` },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Accept Offer", href: acceptLink, primary: true },
      { label: "Counter Offer", href: counterLink },
      { label: "View Details", href: viewLink },
    ],
    logoUrl: appUrl("/brand-email.png"),
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
      ? `${sellerName} accepted your offer. Please review and sign.`
      : "The seller accepted your offer. Please review and sign.",
    keyValues: [
      { label: "Listing", value: offer.listingTitle },
      { label: "District", value: offer.district },
      ...(offer.waterType ? [{ label: "Water Type", value: offer.waterType }] : []),
      { label: "Volume (AF)", value: fmt(offer.volumeAf) },
      { label: "Price", value: offer.priceLabel ?? `$${fmt(offer.pricePerAf)}/AF` },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Review & Sign", href: signLink, primary: true },
      ...(viewLink ? [{ label: "View Details", href: viewLink }] : []),
    ],
    logoUrl: appUrl("/brand-email.png"),
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
      { label: "Price", value: offer.priceLabel ?? `$${fmt(offer.pricePerAf)}/AF` },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      { label: "Make a Counter", href: counterLink, primary: true },
      { label: "Decline", href: declineLink },
      { label: "View Details", href: viewLink },
    ],
    logoUrl: appUrl("/brand-email.png"),
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
      { label: "Price", value: offer.priceLabel ?? `$${fmt(offer.pricePerAf)}/AF` },
      ...(offer.windowLabel ? [{ label: "Window", value: offer.windowLabel }] : []),
    ],
    ctas: [
      ...(viewLink ? [{ label: "View Listing", href: viewLink, primary: true }] : []),
      { label: "Browse Listings", href: appUrl("/listings") },
    ],
    logoUrl: appUrl("/brand-email.png"),
  });
  return { html, preheader: "Offer declined—browse similar opportunities." };
}
