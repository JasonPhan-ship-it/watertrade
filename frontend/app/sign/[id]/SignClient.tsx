// app/sign/[id]/SignClient.tsx
"use client";

import { useEffect, useRef } from "react";
import { HelloSign } from "@dropbox/sign-embedded";

function isAllowedProdHost(host: string) {
  return host === "watertraders.com" || host.endsWith(".watertraders.com");
}

export default function SignClient({
  signUrl,
  isTestMode,
}: {
  signUrl: string;
  isTestMode: boolean;
}) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    if (!signUrl) {
      console.error("[sign] Missing signUrl");
      return;
    }

    const clientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID;
    if (!clientId) {
      console.error("[sign] NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID is not set");
      return;
    }

    const host = window.location.hostname;
    const skip = !!isTestMode && !isAllowedProdHost(host);

    // Official pattern: pass clientId in the constructor
    const client = new HelloSign({ clientId });

    client.on?.("error", (e: any) => console.error("[sign/error]", e));
    client.on?.("open", (e: any) => console.info("[sign/event] open", e));
    client.on?.("close", () => console.info("[sign/event] close"));

    client.open(signUrl, {
      allowCancel: true,
      skipDomainVerification: skip, // true on previews/local with testMode=1
      // container: undefined, // (optional) provide a DOM node to embed inline
      // uxVersion: 2,
      debug: true,
      timeout: 30000,
    });

    openedRef.current = true;

    const mask = (s: string) => (s && s.length > 8 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);
    console.info("[sign/open]", {
      host,
      isTestMode,
      skipDomainVerification: skip,
      clientId: mask(clientId),
    });
  }, [signUrl, isTestMode]);

  return null;
}
