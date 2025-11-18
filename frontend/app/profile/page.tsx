// app/profile/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const PRESET_DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

function ErrorCard({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
      <p className="mt-3 text-sm text-red-600">{message}</p>
      {detail && process.env.NODE_ENV !== "production" && (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border bg-red-50 p-3 text-xs text-rose-700">
          {detail}
        </pre>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/sign-in?redirect_url=/profile"
          className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

function nonEmpty<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined && `${v}`.trim() !== "";
}
function uniqStrings(arr: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const v of arr) {
    const s = (v ?? "").trim();
    if (s) out.add(s);
  }
  return Array.from(out);
}

export default async function ProfilePage() {
  let debug = "";
  try {
    // 0) Basic env sanity
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }

    // 1) Auth
    debug = "auth()";
    const authRes = await (async () => {
      try {
        return auth();
      } catch (e: any) {
        throw new Error(`Clerk auth failed: ${e?.message || e}`);
      }
    })();

    const clerkId = authRes?.userId;
    if (!clerkId) {
      return <ErrorCard message="You must be signed in to view your profile." />;
    }

    // 2) Clerk user (best-effort)
    debug = "clerkClient.users.getUser";
    const clerkUser = await (async () => {
      try {
        return await clerkClient.users.getUser(clerkId);
      } catch (e: any) {
        // Non-fatal — continue with blanks
        return null;
      }
    })();

    const primaryEmail =
      clerkUser?.emailAddresses?.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
      clerkUser?.emailAddresses?.[0]?.emailAddress ||
      "";

    // 3) Ensure local User (prefer match by clerkId; fallback to email)
    debug = "prisma.user.findUnique(clerkId)";
    let user = await prisma.user.findUnique({ where: { clerkId } });

    if (!user && primaryEmail) {
      debug = "prisma.user.findUnique(email)";
      const byEmail = await prisma.user.findUnique({ where: { email: primaryEmail } }).catch(() => null);
      if (byEmail && !byEmail.clerkId) {
        // Link existing user to clerkId
        debug = "prisma.user.update(link clerkId)";
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { clerkId },
        });
      }
    }

    if (!user) {
      debug = "prisma.user.create";
      user = await prisma.user.create({
        data: {
          clerkId,
          email: primaryEmail || `unknown+${clerkId}@example.com`,
          name:
            (clerkUser?.firstName || "") +
              (clerkUser?.lastName ? ` ${clerkUser.lastName}` : "") ||
            clerkUser?.username ||
            primaryEmail ||
            "Unknown",
        },
      });
    }

    // 4) Ensure UserProfile with fullName
    const fallbackFullName =
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser?.username ||
      user.name ||
      primaryEmail ||
      "Unknown";

    debug = "prisma.userProfile.findUnique";
    const existing = await prisma.userProfile.findUnique({ where: { userId: user.id } });

    debug = existing ? "prisma.userProfile.update" : "prisma.userProfile.create";
    const profile = existing
      ? await prisma.userProfile.update({
          where: { id: existing.id },
          data: {
            fullName: existing.fullName && existing.fullName.trim() ? existing.fullName : fallbackFullName,
            email: primaryEmail || existing.email || null,
          },
        })
      : await prisma.userProfile.create({
          data: {
            userId: user.id,
            fullName: fallbackFullName,
            email: primaryEmail || null,
          },
        });

    // 5) Farms
    debug = "prisma.farm.findMany";
    const farms = await prisma.farm.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { name: true, accountNumber: true, district: true },
    });

    // 6) Render
    const name = profile.fullName?.trim() || "—";
    const email = (profile.email ?? "").trim() || "—";
    const cell = (profile.cellPhone ?? "").trim() || "—";
    const address = (profile.address ?? "").trim() || "—";
    const role = (profile.tradeRole ?? "").trim() || "—";
    const company = (profile.company ?? "").trim() || "—";
    const primaryDistrict = (profile.primaryDistrict ?? "").trim();

    const districts = uniqStrings([
      ...(Array.isArray(profile.districts) ? profile.districts : []),
      primaryDistrict || null,
    ]).filter(Boolean);

    const preset = districts.filter((d) => PRESET_DISTRICTS.includes(d as any));
    const custom = districts.filter((d) => !PRESET_DISTRICTS.includes(d as any)).sort((a, b) => a.localeCompare(b));
    const orderedDistricts = [...preset, ...custom];

    const waterTypes = Array.isArray(profile.waterTypes) ? profile.waterTypes : [];

    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
            <p className="mt-1 text-slate-600">View your details. Make changes on the edit page.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link
              href="/profile/edit"
              prefetch={false}
              className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#003a2f]"
            >
              Edit profile
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Identity */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Identity</div>
          <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Name</dt>
              <dd className="mt-1 text-sm text-slate-900">{name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Company</dt>
              <dd className="mt-1 text-sm text-slate-900">{company}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Role</dt>
              <dd className="mt-1 text-sm text-slate-900">{role}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Address</dt>
              <dd className="mt-1 text-sm text-slate-900">{address}</dd>
            </div>
          </dl>
        </section>

        {/* Contact */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Contact</div>
          <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="mt-1 text-sm text-slate-900">{email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Cell</dt>
              <dd className="mt-1 text-sm text-slate-900">{cell}</dd>
            </div>
            {typeof profile.smsOptIn === "boolean" && (
              <div>
                <dt className="text-xs text-slate-500">SMS Opt-In</dt>
                <dd className="mt-1 text-sm text-slate-900">{profile.smsOptIn ? "Yes" : "No"}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Water */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Water Preferences</div>
          <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Primary District</dt>
              <dd className="mt-1 text-sm text-slate-900">{primaryDistrict || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">All Districts</dt>
              <dd className="mt-1 text-sm text-slate-900">
                {orderedDistricts.length ? orderedDistricts.join(", ") : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Water Types</dt>
              <dd className="mt-1 text-sm text-slate-900">{waterTypes.length ? waterTypes.join(", ") : "—"}</dd>
            </div>
          </dl>
        </section>

        {/* Farms */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Farms</div>
          {farms.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No farms on file.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {farms.map((f, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4">
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-slate-500">Name</dt>
                      <dd className="mt-1 text-sm text-slate-900">{nonEmpty(f.name) ? f.name : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Water Account #</dt>
                      <dd className="mt-1 text-sm text-slate-900">
                        {nonEmpty(f.accountNumber) ? f.accountNumber : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">District</dt>
                      <dd className="mt-1 text-sm text-slate-900">{nonEmpty(f.district) ? f.district : "—"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  } catch (e: any) {
    console.error("[/profile] error at step:", e, "last step:", typeof e === "object" ? "" : "");
    return (
      <ErrorCard
        message="Something went wrong loading your profile. Please try again."
        detail={`Last step: ${JSON.stringify({ where: "server component", hint: "see server logs for stack", debugStep: (typeof e === "string" ? e : undefined) })}\n${e?.message || String(e)}`}
      />
    );
  }
}
