import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me || me.role !== "ADMIN") redirect("/");

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
