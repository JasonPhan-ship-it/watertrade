// app/api/_dev/email-smoke/route.ts
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET() {
  const r = await sendEmail({
    to: process.env.TEST_EMAIL_TO || "you@example.com",
    subject: "Water Traders email smoke test",
    html: "<div>Smoke test ✅</div>",
  });
  return NextResponse.json({ ok: true, id: r.id });
}
