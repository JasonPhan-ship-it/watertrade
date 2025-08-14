// app/admin/settings/page.tsx
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import TestEmailButton from "./TestEmailButton";

export default async function AdminSettingsPage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  // Ensure a local User exists
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
        <div className="mt-3">
          <TestEmailButton email={user.email} />
        </div>
      </section>
    </div>
  );
}
