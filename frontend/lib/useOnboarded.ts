// lib/useOnboarded.ts
"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";

export function useOnboardedGate() {
  const router = useRouter();
  const path = usePathname();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();

  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    (async () => {
      if (!authLoaded || !userLoaded) return;

      if (!isSignedIn) {
        // Send to sign-in and come back
        const ret = `${path}`;
        router.replace(`/sign-in?redirect_url=${encodeURIComponent(ret)}`);
        return;
      }

      // If Clerk already says onboarded, we’re done
      if (user?.publicMetadata?.onboarded === true) {
        if (active) setChecking(false);
        return;
      }

      // Ask the server (also sets a cookie)
      try {
        const r = await fetch("/api/onboarding/init", { credentials: "include", cache: "no-store" });
        if (r.status === 401) {
          const ret = `${path}`;
          router.replace(`/sign-in?redirect_url=${encodeURIComponent(ret)}`);
          return;
        }
        const j = await r.json();
        if (j?.onboarded === true) {
          if (active) setChecking(false);
          return;
        }
      } catch {
        // ignore network errors, treat as not onboarded
      }

      // Not onboarded → go to onboarding with return path
      const next = path || "/dashboard";
      router.replace(`/onboarding?next=${encodeURIComponent(next)}`);
    })();

    return () => { active = false; };
  }, [authLoaded, userLoaded, isSignedIn, user?.publicMetadata?.onboarded, path, router]);

  return checking; // true = show skeleton, false = safe to render page
}
