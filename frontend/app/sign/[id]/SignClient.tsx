// app/sign/[id]/SignClient.tsx
"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

type Props = {
  signUrl: string;
  isTestMode: boolean;
};

declare global {
  interface Window {
    HelloSign?: {
      open: (opts: any) => void;
      close?: () => void;
    };
  }
}

const RAW_CLIENT_ID = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID || "";
const CLIENT_ID = RAW_CLIENT_ID.trim();

function mask(s: string) {
  return s ? `${s.slice(0, 6)}…${s.slice(-6)}` : "";
}

function maskSignatureFromUrl(url: string) {
  try {
    const u = new URL(url);
    const sig = u.searchParams.get("signature_id") || "";
    return mask(sig);
  } catch {
    return "";
  }
}

export default function SignClient({ signUrl, isTestMode }: Props) {
  const openedRef = useRef(false);

  // Try to open immediately if the script already exists
  useEffect(() => {
    if (window.HelloSign && !openedRef.current) {
      openHelloSign(signUrl, isTestMode);
      openedRef.current = true;
    }
    return () => {
      try {
        window.HelloSign?.close?.();
        openedRef.current = false;
      } catch {}
    };
  }, [signUrl, isTestMode]);

  // Called once the embed script loads
  const handleLoad = () => {
    if (!openedRef.current) {
      openHelloSign(signUrl, isTestMode);
      openedRef.current = true;
    }
  };

  const handleError = () => {
    // eslint-disable-next-line no-console
    console.error("[SignClient] Failed to load HelloSign embed script");
  };

  return (
    <Script
      src="https://cdn.hellosign.com/public/js/hellosign-embedded.LATEST.min.js"
      strategy="afterInteractive"
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}

function openHelloSign(signUrl: string, isTestMode: boolean) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const maskedClient = mask(CLIENT_ID);
  const maskedSig = maskSignatureFromUrl(signUrl);

  if (!CLIENT_ID) {
    // eslint-disable-next-line no-console
    console.error(
      "[SignClient] Missing NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID. The embed will fail with 'Missing/Invalid parameter: client_id'."
    );
    return;
  }

  // Helpful runtime diagnostics
  // eslint-disable-next-line no-console
  console.log("[SignClient] opening", {
    clientIdPrefix: CLIENT_ID.slice(0, 6),
    clientIdSuffix: CLIENT_ID.slice(-6),
    signatureIdMasked: maskedSig,
    isTestMode,
    origin,
  });

  try {
    // Be explicit about parent URL; include snake_case fallback just in case.
    const opts: any = {
      url: signUrl,
      clientId: CLIENT_ID,
      uxVersion: 2,
      allowCancel: true,
      skipDomainVerification: !!isTestMode, // only in test mode
      parentUrl: origin,
      parent_url: origin, // some integrations still look for snake_case
    };

    (window as any).HelloSign?.open(opts);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[SignClient] HelloSign.open failed", e);
  }
}
