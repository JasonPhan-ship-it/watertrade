// components/SignerEmbed.tsx
"use client";
import Script from "next/script";
import { useEffect } from "react";

const IS_PROD = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

export default function SignerEmbed({ signUrl }: { signUrl: string }) {
  useEffect(() => {
    // Open once the script is loaded
    if (typeof window !== "undefined" && (window as any).HelloSign) {
      (window as any).HelloSign.open({
        url: signUrl,                                  // from /api/sign-url
        clientId: process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID, // <-- REQUIRED
        uxVersion: 2,
        allowCancel: true,
        // ok for dev/test only (your server created request with testMode: 1)
        skipDomainVerification: !IS_PROD,
      });
    }
  }, [signUrl]);

  return (
    <Script src="https://cdn.hellosign.com/public/js/hellosign-embedded.LATEST.min.js" strategy="afterInteractive" />
  );
}
