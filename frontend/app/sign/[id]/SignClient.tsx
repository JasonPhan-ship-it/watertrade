// app/sign/[id]/SignClient.tsx
"use client";

import { useEffect } from "react";

function isAllowedProdHost(host: string) {
  return host === "watertraders.com" || host.endsWith(".watertraders.com");
}

export default function SignClient({ signUrl, isTestMode }: { signUrl: string; isTestMode: boolean }) {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID!;
    const host = window.location.hostname;
    const skip = isTestMode && !isAllowedProdHost(host);

    // If using CDN: window.HelloSign is available
    // <Script src="https://cdn.hellosign.com/public/js/hellosign-embedded.min.js" />
    const client = new (window as any).HelloSign({ clientId });
    client.open(signUrl, {
      // For previews/local in test_mode=1 we skip domain verification
      skipDomainVerification: skip,
      allowCancel: true,
      // You can also set 'uxVersion' if needed
    });

    // Helpful console to see what's going on
    // eslint-disable-next-line no-console
    console.info("[sign] host:", host, "isTestMode:", isTestMode, "skipDomainVerification:", skip);
  }, [signUrl, isTestMode]);

  return null;
}
