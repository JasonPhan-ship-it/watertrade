import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM;

function escapeHtml(s: string) {
  return s.replace(/[&<>\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    // Honeypot
    const trap = String(form.get("company") || "");
    if (trap.trim() !== "") {
      // silently accept to confuse bots
      return NextResponse.json({ ok: true });
    }

    const firstName = String(form.get("firstName") || "").trim();
    const lastName = String(form.get("lastName") || "").trim();
    const email = String(form.get("email") || "").trim();
    const subject = String(form.get("subject") || "").trim();
    const message = String(form.get("message") || "").trim();

    const missing: string[] = [];
    if (!firstName) missing.push("firstName");
    if (!lastName) missing.push("lastName");
    if (!email) missing.push("email");
    if (!subject) missing.push("subject");
    if (!message) missing.push("message");
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    if (!SUPPORT_EMAIL) {
      throw new Error("SUPPORT_EMAIL or EMAIL_FROM must be configured to receive contact form submissions.");
    }

    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
    await sendEmail({
      to: SUPPORT_EMAIL,
      replyTo: email,
      subject: `Contact form: ${subject}`,
      html: `
        <p>You have a new contact form submission.</p>
        <p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Message:</strong><br>${safeMessage}</p>
      `,
      text: `New contact form submission\nName: ${firstName} ${lastName}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
    });

    console.log("[contact] message", { firstName, lastName, email, subject, len: message.length });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("contact error", err);
    return NextResponse.json({ ok: false, error: "We couldn't send your message. Please try again in a moment." }, { status: 500 });
  }
}
