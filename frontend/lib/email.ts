// lib/email.ts
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) {
    console.warn("RESEND_API_KEY missing; skipping email send.");
    return;
  }
  if (!from) {
    throw new Error("EMAIL_FROM env var is required");
  }

  // Resend expects an array for 'to'
  const toList = Array.isArray(to) ? to : [to];

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: toList,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${text || res.statusText}`);
  }
}

export function appUrl(path = "/") {
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base}${path}`;
}
