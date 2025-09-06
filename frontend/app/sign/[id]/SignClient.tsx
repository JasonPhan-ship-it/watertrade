// app/sign/[id]/SignClient.tsx
"use client";

import { useEffect } from "react";

function isProdHost(h: string) {
  return h === "watertraders.com" || h === "www.watertraders.com";
}

export default function SignClient({
  signUrl,
  isTestMode,
}: { signUrl: string; isTestMode: boolean }) {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID!;
    const host = window.location.hostname;

    // ✅ Force skip when test_mode=1, and also skip on non-prod hosts
    const skip = isTestMode || !isProdHost(host);

    const ensureAndOpen = async () => {
      if (!(window as any).HelloSign) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.hellosign.com/public/js/hellosign-embedded.min.js";
          s.async = true;
          s.onload = () => resolve();
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const hs = new (window as any).HelloSign({ clientId });
      hs.open(signUrl, {
        skipDomainVerification: skip,
        allowCancel: true,
        debug: true,
      });
      // helpful log
      // eslint-disable-next-line no-console
      console.info("[sign/open]", { host, isTestMode, skipDomainVerification: skip, clientId, signUrl });
    };

    ensureAndOpen().catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[sign/open] failed", e);
    });
  }, [signUrl, isTestMode]);

  return null;
}
