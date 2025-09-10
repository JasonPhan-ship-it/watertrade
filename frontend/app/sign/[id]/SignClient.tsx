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
      open: (opts: {
        url: string;
        clientId: string;
        uxVersion?: number;
        allowCancel?: boolean;
        skipDomainVerification?: boolean;
        // parent_url is auto-detected, but you can pass it explicitly if needed:
        // parentUrl?: string;
      }) => void;
      close?: () => void;
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID || "";

export default function SignClient({ signUrl, isTestMode }: Props) {
  const openedRef = useRef(false);

  useEffect(() => {
    // If the embed script is already on the page, try opening immediately.
    if (window.HelloSign && !openedRef.current) {
      open(signUrl, isTestMode);
      openedRef.current = true;
    }
    return () => {
      try {
        window.HelloSign?.close?.();
      } catch {}
    };
  }, [signUrl, isTestMode]);

  // Called once the script is loaded
  const handleLoad = () => {
    if (!openedRef.current) {
      open(signUrl, isTestMode);
      openedRef.current = true;
    }
  };

  return (
    <Script
      src="https://cdn.hellosign.com/public/js/hellosign-embedded.LATEST.min.js"
      strategy="afterInteractive"
      onLoad={handleLoad}
    />
  );
}

function open(signUrl: string, isTestMode: boolean) {
  if (!CLIENT_ID) {
    // eslint-disable-next-line no-console
    console.error(
      "[SignClient] Missing NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID. The embed will fail with 'Missing parameter: client_id'."
    );
    return;
  }
  try {
    window.HelloSign?.open({
      url: signUrl,
      clientId: CLIENT_ID,
      uxVersion: 2,
      allowCancel: true,
      // Skip only in test mode. In production, make sure your exact host(s) are whitelisted.
      skipDomainVerification: !!isTestMode,
      // parentUrl: window.location.origin, // optional; auto-detected
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[SignClient] HelloSign.open failed", e);
  }
}
