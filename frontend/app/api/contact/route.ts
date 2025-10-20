import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

const CONTACT_RECIPIENT =
  process.env.CONTACT_INBOX ||
  process.env.SUPPORT_EMAIL ||
  process.env.SALES_EMAIL ||
  process.env.EMAIL_FROM;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch)
  );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
    }

    const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Contact form user";
    const fallbackSubject = subject || "New contact form submission";

    console.log("[contact] message", {
      name: displayName,
      email,
      subject: fallbackSubject,
      len: message.length,
    });

    if (CONTACT_RECIPIENT) {
      const html = `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 16px;">
          <h2 style="color:#004434; margin-bottom: 12px;">New contact request</h2>
          <p><strong>From:</strong> ${escapeHtml(displayName)} (${escapeHtml(email)})</p>
          ${subject ? `<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>` : ""}
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />
          <div style="white-space: pre-wrap; line-height: 1.6; color: #0f172a;">${escapeHtml(message)}</div>
        </div>
      `;

      await sendEmail({
        to: CONTACT_RECIPIENT,
        subject: `[Contact] ${fallbackSubject}`,
        html,
        replyTo: email,
      }).catch((emailError) => {
        console.error("[contact] failed to send email", emailError);
        throw new Error("Failed to deliver message");
      });
    } else {
      console.warn("[contact] CONTACT_RECIPIENT not configured; message logged only");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("contact error", err);
    return NextResponse.json({ ok: false, error: "Failed to submit" }, { status: 500 });
  }
}
