// app/api/admin/send-test-email/route.ts
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl } from "@/lib/email";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Ensure local user + ADMIN role
    let user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      const cu = await clerkClient.users.getUser(userId);
      const email =
        cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ||
        cu?.emailAddresses?.[0]?.emailAddress ||
        `${userId}@example.local`;
      const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
      user = await prisma.user.create({
        data: { clerkId: userId, email, name: name ?? undefined },
      });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await sendEmail({
      to: user.email,
      subject: "Water Traders: Test Email",
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
          <h2>It works 🎉</h2>
          <p>This is a test email from <strong>${appUrl("/")}</strong>.</p>
          <p>If you received this, your <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> are configured correctly.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/admin/send-test-email error:", err);
    const msg =
      typeof err?.message === "string" && err.message.length < 500
        ? err.message
        : "Failed to send test email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
