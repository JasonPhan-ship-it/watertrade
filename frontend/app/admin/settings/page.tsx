// app/admin/settings/page.tsx
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

// Small client island for calling the test-email API
function TestEmailButton({ email }: { email: string }) {
  "use client";
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = React.useState<string | null>(null);

  async function send() {
    try {
      setState("sending");
      setMsg(null);
      const res = await fetch("/api/admin/send-test-email", { method: "POST" });
      if (!res.ok) {
        let m = "Failed";
        try {
          const j = await res.json();
          m = j?.error || m;
        } catch {
          m = await res.text().catch(() => m);
        }
        throw new Error(m);
      }
      setState("sent");
      setMsg(`Sent to ${email}`);
    } catch (e: any) {
      setState("error");
      setMsg(e?.message || "Failed to send");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={send}
        disabled={state === "sending"}
        className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send Test Email"}
      </button>
      {msg ? (
        <span className={`text-sm ${state === "error" ? "text-red-600" : "text-slate-600"}`}>
          {msg}
        </span>
      ) : null}
    </div>
  );
}

export default async function AdminSettingsPage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  // Ensure we have a local User row and verify ADMIN role
  let user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    // Create a lightweight local user from Clerk so admins aren't blocked
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
    // Non-admins get bounced
    redirect("/dashboard");
  }

  const appUrl = process.env.APP_URL || "(not set)";
  const emailFrom = process.env.EMAIL_FROM || "(not set)";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Settings</h1>
      <p className="mt-1 text-slate-600">Manage operational settings and integrations.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-medium">Environment</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">APP_URL</div>
            <div className="mt-1 font-mono text-slate-800">{appUrl}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">EMAIL_FROM</div>
            <div className="mt-1 font-mono text-slate-800 break-all">{emailFrom}</div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-medium">Email</h2>
        <p className="mt-1 text-sm text-slate-600">
          Send a test email to confirm your Resend configuration.
        </p>
        {/* @ts-expect-error: Server comp rendering client comp inline */}
        <div className="mt-3">
          <TestEmailButton email={user.email} />
        </div>
      </section>
    </div>
  );
}
