// app/admin/layout.tsx
export const runtime = "nodejs";

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  let role: "ADMIN" | "USER" | null = null;
  try {
    const me = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { role: true },
    });
    role = me?.role ?? null;
  } catch {
    return (
      <HardStop title="Database error">
        <p className="text-sm text-slate-600">
          Couldn’t query the database. Check <code>DATABASE_URL</code> and migrations.
        </p>
        <p className="text-sm">
          See <Link className="underline" href="/api/debug/admin-health">/api/debug/admin-health</Link>.
        </p>
      </HardStop>
    );
  }

  if (!role) {
    return (
      <HardStop title="Account not provisioned">
        <p className="text-sm text-slate-600">
          No matching <code>User</code> row for your Clerk account. Ensure <code>clerkId</code> matches and set <code>role='ADMIN'</code>.
        </p>
        <p className="text-sm">
          See <Link className="underline" href="/api/debug/whoami">/api/debug/whoami</Link>.
        </p>
      </HardStop>
    );
  }

  if (role !== "ADMIN") redirect("/");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 md:grid-cols-[220px,1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <nav className="space-y-1 text-sm">
              <NavLink href="/admin">Overview</NavLink>
              <NavLink href="/admin/listings">Listings</NavLink>
              <NavLink href="/admin/users">Users</NavLink>
              <NavLink href="/admin/transactions">Transactions</NavLink>
              <NavLink href="/admin/settings">Settings</NavLink>
            </nav>
          </aside>
          <section>{children}</section>
        </div>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
      {children}
    </Link>
  );
}

function HardStop({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="mt-3 space-y-2">{children}</div>
      <div className="mt-4">
        <Link href="/" className="text-sm underline">Go home</Link>
      </div>
    </div>
  );
}
