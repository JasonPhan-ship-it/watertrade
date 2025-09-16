import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    // Honeypot
    const trap = String(form.get("company") || "");
    if (trap.trim() !== "") {
      // silently accept to confuse bots
      return NextResponse.json({ ok: true });
    }

    const firstName = String(form.get("firstName") || "");
    const lastName  = String(form.get("lastName") || "");
    const email     = String(form.get("email") || "");
    const subject   = String(form.get("subject") || "");
    const message   = String(form.get("message") || "");

    // TODO: send using your email service (Resend, SendGrid, SES, etc.)
    // await sendEmail({ firstName, lastName, email, subject, message });

    console.log("[contact] message", { firstName, lastName, email, subject, len: message.length });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("contact error", err);
    return NextResponse.json({ ok: false, error: "Failed to submit" }, { status: 500 });
  }
}
