// app/admin/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  // Try to load the user; never hard-crash the page
  let me: { role: "ADMIN" | "USER" } | null = null;
  try {
    me = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { role: true },
    });
  } catch {
    // On DB error, render a helpful screen instead of throwing
    return (
      <HardStop title="Database connection error">
        <p className="text-sm text-slate-600">
          We couldn’t reach the database from this route. Check your <code>DATABASE_URL</code> and migrations.
        </p>
        <p className="text-sm text-slate-600">
          Debug endpoints: <Link className="underline" href="/api/debug/whoami">/api/debug/whoami</Link>,{" "}
          <Link className="underline" href="/api/debug/columns">/api/debug/columns</Link>
        </p>
      </HardStop>
    );
  }

  // If no row exists for this Clerk user, they aren’t provisioned yet
  if (!me) {
    return (
      <HardStop title="Account not provisioned">
        <p className="text-sm text-slate-600">
          Your Clerk account exists, but no matching <code>User</code> row was found.
          Add one with your <code>clerkId</code> and set <code>role = 'ADMIN'</code>, or call a one-time
          provision route.
        </p>
        <p className="text-sm text-slate-600">
          See <Link className="underline" href="/api/debug/whoami">/api/debug/whoami</Link> for your IDs.
        </p>
      </HardStop>
    );
  }

  if (me.role !== "ADMIN") {
    // Not an admin → send home
    redirect("/");
  }

  // ✅ Admin shell
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
