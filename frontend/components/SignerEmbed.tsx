// components/SignerEmbed.tsx
"use client";
import Script from "next/script";
import { useCallback } from "react";

declare global {
  interface Window {
    HelloSign?: any;
  }
}

const IS_PROD = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

export default function SignerEmbed({ signUrl }: { signUrl: string }) {
  const open = useCallback(() => {
    window.HelloSign?.open({
      url: signUrl,
      clientId: process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID,
      uxVersion: 2,
      allowCancel: true,
      // Only skip in non-prod (and only when test_mode=1 on the request):
      skipDomainVerification: !IS_PROD,
    });
  }, [signUrl]);

  return (
    <>
      <Script
        src="https://cdn.hellosign.com/public/js/hellosign-embedded.LATEST.min.js"
        strategy="afterInteractive"
        onLoad={open}
      />
    </>
  );
}
