// lib/email.ts

/**
 * Email + URL helpers for the app.
 * Uses Resend (https://resend.com) for email delivery.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type EmailAddress = string; // "user@example.com" or "Name <user@example.com>"

export type SendEmailOptions = {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  /** Optional plain-text alternative */
  text?: string;
  /** Override default sender (must be a verified domain in Resend) */
  from?: EmailAddress;
  /** Set reply-to header (can be a single email or "Name <email>" format) */
  replyTo?: EmailAddress | EmailAddress[];
  /** Optional cc/bcc lists */
  cc?: EmailAddress | EmailAddress[];
  bcc?: EmailAddress | EmailAddress[];
  /**
   * Optional idempotency key to avoid duplicates if you retry.
   * (You generate it: e.g., transactionId or `${kind}:${id}`)
   */
  idempotencyKey?: string;
  /** Abort after N ms (default 15s) */
  timeoutMs?: number;
};

function ensureArray<T>(v?: T | T[]): T[] | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? (v.length ? v : undefined) : [v];
}

function isValidFromAddress(v: string): boolean {
  // Accepts "email@example.com" OR "Name <email@example.com>"
  // (Simple check that catches common mistakes; Resend will still validate.)
  const simple = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nameAddr = /^.+\s<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/;
  return simple.test(v) || nameAddr.test(v);
}

/**
 * Sends an email via Resend.
 * Requires:
 *   - RESEND_API_KEY
 *   - EMAIL_FROM (must be verified in Resend), format:
 *       "no-reply@yourdomain.com"  OR  "Water Traders <no-reply@yourdomain.com>"
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM;

  if (!apiKey) {
    // In dev you might intentionally skip sending; log clearly.
    console.warn("RESEND_API_KEY missing; skipping email send.");
    return {};
  }

  const from = opts.from ?? defaultFrom;
  if (!from) {
    throw new Error(
      "EMAIL_FROM env var is required (e.g. 'Water Traders <no-reply@yourdomain.com>')."
    );
  }
  if (!isValidFromAddress(from)) {
    throw new Error(
      `EMAIL_FROM is not valid. Use "email@example.com" or "Name <email@example.com>". Got: ${from}`
    );
  }

  const to = ensureArray(opts.to);
  if (!to?.length) throw new Error("sendEmail: 'to' is required.");

  const body: Record<string, unknown> = {
    from,
    to,
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.text) body.text = opts.text;

  const replyTo = ensureArray(opts.replyTo);
  const cc = ensureArray(opts.cc);
  const bcc = ensureArray(opts.bcc);
  if (replyTo) body.reply_to = replyTo;
  if (cc) body.cc = cc;
  if (bcc) body.bcc = bcc;

  // Abort/timeout protection so we don't hang a serverless function.
  const timeoutMs = opts.timeoutMs ?? 15000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t));

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Common helpful hints
    if (res.status === 422 && text.includes("Invalid `from` field")) {
      throw new Error(
        `Resend 422: Invalid 'from' field. Ensure you use "email@example.com" or "Name <email@example.com>" and that the domain is verified in Resend. Response: ${text}`
      );
    }
    if (res.status === 429) {
      throw new Error(`Resend 429: Rate limited. Consider using an idempotency key. Response: ${text}`);
    }
    throw new Error(`Resend error ${res.status}: ${text || res.statusText}`);
  }

  // Resend returns JSON with an "id"
  let id: string | undefined;
  try {
    const json: any = await res.json();
    id = json?.id;
  } catch {
    // ignore parse errors; sending already succeeded
  }
  return { id };
}

/** Build absolute app URLs in a deploy-safe way. */
export function appUrl(path = "/") {
  // Prefer explicit base domain if provided
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    process.env.APP_URL || // your previous var, still supported
    "http://localhost:3000";

  const base = envBase.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
