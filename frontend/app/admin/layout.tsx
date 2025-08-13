// app/admin/layout.tsx
export const runtime = "nodejs";

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  // Try to read the user role from DB without crashing the whole page
  let me: { role: "ADMIN" | "USER" } | null = null;
  try {
    me = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { role: true },
    });
  } catch (e) {
    // Surface a human-friendly error instead of a digest
    return (
      <HardStop title="Database error">
        <p className="text-sm text-slate-600">
          We couldn’t reach the database from <code>/admin/layout.tsx</code>.
          Check your <code>DATABASE_URL</code> and that migrations are applied.
        </p>
        <p className="text-sm text-slate-600">
          Try <Link className="underline" href="/api/debug/admin-health">/api/debug/admin-health</Link> for details.
        </p>
      </HardStop>
    );
  }

  if (!me) {
    return (
      <HardStop title="Account not provisioned">
        <p className="text-sm text-slate-600">
          Your Clerk account exists, but no matching <code>User</code> row was found.
          Ensure a row with your <code>clerkId</code> exists and set <code>role='ADMIN'</code>.
        </p>
        <p className="text-sm text-slate-600">
          See <Link className="underline" href="/api/debug/whoami">/api/debug/whoami</Link>.
        </p>
      </HardStop>
    );
  }

  if (me.role !== "ADMIN") {
    redirect("/"); // not an admin
  }

  // ✅ Admin shell
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 md:grid-cols-[220px,1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
