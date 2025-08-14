// lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY missing; skipping email send.");
    return;
  }
  if (!process.env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM env var is required");
  }
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
}

export function appUrl(path = "/") {
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base}${path}`;
}
