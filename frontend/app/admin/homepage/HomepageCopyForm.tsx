// app/admin/homepage/page.tsx
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSiteSetting } from "@/lib/site-settings";
import { HomepageCopyForm } from "./HomepageCopyForm";

export default async function AdminHomepagePage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

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

  const homepageCopy = await getSiteSetting("homepageCopy");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Homepage content</h1>
      <p className="mt-1 text-slate-600">
        Update the marketing copy that appears on the public landing page.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <HomepageCopyForm initialCopy={homepageCopy} />
      </section>
    </div>
  );
}
