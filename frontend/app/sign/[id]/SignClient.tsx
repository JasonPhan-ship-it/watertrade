// app/sign/[id]/SignClient.tsx
"use client";
import { useEffect, useRef } from "react";
import HelloSign from "hellosign-embedded";

function isProdHost(h: string) { return h === "watertraders.com" || h.endsWith(".watertraders.com"); }

export default function SignClient({ signUrl, isTestMode }: { signUrl: string; isTestMode: boolean }) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current || !signUrl) return;
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID!;
    const skip = !!isTestMode && !isProdHost(location.hostname);

    const client = new HelloSign(); // pass clientId in open(...)
    client.open(signUrl, {
      clientId,
      skipDomainVerification: skip,
      allowCancel: true,
      debug: true,
    });

    openedRef.current = true;
    console.info("[sign/open]", { host: location.hostname, isTestMode, skipDomainVerification: skip, clientId });
  }, [signUrl, isTestMode]);

  return null;
}
