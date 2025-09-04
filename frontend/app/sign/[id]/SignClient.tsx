// app/sign/[id]/SignClient.tsx
"use client";

import { useEffect, useRef } from "react";
import HelloSign from "hellosign-embedded";

function isAllowedProdHost(host: string) {
  return host === "watertraders.com" || host.endsWith(".watertraders.com");
}

export default function SignClient({ signUrl, isTestMode }: { signUrl: string; isTestMode: boolean }) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    if (!signUrl) return console.error("[sign] Missing signUrl");

    const clientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID;
    if (!clientId) return console.error("[sign] NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID is not set");

    const host = window.location.hostname;
    const skip = !!isTestMode && !isAllowedProdHost(host);

    // Per SDK: instantiate with no args; pass clientId in open(...)
    const client = new HelloSign();

    client.on?.("error", (e: any) => console.error("[sign/error]", e));
    client.on?.("open",  (e: any) => console.info("[sign/event] open", e));
    client.on?.("close", () => console.info("[sign/event] close"));

    client.open(signUrl, {
      clientId,
      skipDomainVerification: skip, // true on previews when testMode=1
      allowCancel: true,
      debug: true,
      timeout: 30000
    });

    openedRef.current = true;

    const mask = (s: string) => (s && s.length > 8 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);
    console.info("[sign/open]", { host, isTestMode, skipDomainVerification: skip, clientId: mask(clientId) });
  }, [signUrl, isTestMode]);

  return null;
}
