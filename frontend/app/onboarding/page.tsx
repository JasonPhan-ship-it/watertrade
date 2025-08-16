"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, useUser } from "@clerk/nextjs";

const PRESET_DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

type FarmRow = {
  name: string;
  accountNumber: string;
  district: string;      // value or "__OTHER__"
  otherDistrict?: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const force = sp?.get("force") === "1";              // allow QA to force-show the form
  const nextPath = sp?.get("next") ?? "/dashboard";

  const { session, isLoaded: sessionLoaded } = useSession();
  const { user, isLoaded: userLoaded } = useUser();

  if (!sessionLoaded || !userLoaded) {
    return <div>Loading...</div>;
  }

  // ⚠️ Currently no check for whether onboarding is already completed.
  // Always renders form, unless you add logic.

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const body = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      farmName: formData.get("farmName"),
      accountNumber: formData.get("accountNumber"),
      district: formData.get("district"),
    };

    await fetch("/api/onboarding/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    router.push(nextPath);
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold mb-4">Onboarding</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">First Name</label>
          <input
            type="text"
            name="firstName"
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Last Name</label>
          <input
            type="text"
            name="lastName"
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Farm Name</label>
          <input
            type="text"
            name="farmName"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Account Number</label>
          <input
            type="text"
            name="accountNumber"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">District</label>
          <select
            name="district"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          >
            {PRESET_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="__OTHER__">Other</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-[#0E6A59] text-white px-4 py-2 rounded-md"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
