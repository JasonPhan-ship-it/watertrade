// app/sign/[id]/SignClient.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
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

type Provider = "docusign" | "hellosign" | "unknown";

function detectProvider(url: string): Provider {
  try {
    const { hostname } = new URL(url);
    const h = hostname.toLowerCase();

    if (h.includes("docusign.com") || h.includes("docusign.net")) return "docusign";
    // Dropbox Sign (HelloSign)
    if (
      h.includes("hellosign.com") ||
      h.includes("dropboxsign.com") ||
      h.includes("sign.dropbox.com") ||
      h === "cdn.hellosign.com"
    ) {
      return "hellosign";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export default function SignClient({ signUrl, isTestMode }: Props) {
  const provider = useMemo(() => detectProvider(signUrl), [signUrl]);
  const openedRef = useRef(false);

  // ===== DocuSign path: perform top-level navigation (no embed script) =====
  useEffect(() => {
    if (provider !== "docusign") return;
    if (!signUrl || openedRef.current) return;

    openedRef.current = true;

    // Helpful diagnostics
    // eslint-disable-next-line no-console
    console.log("[SignClient] Navigating to DocuSign…", {
      provider,
      urlHost: safeHost(signUrl),
    });

    // Top-level navigation avoids CORS/fetch redirect issues
    window.location.assign(signUrl);

    return () => {
      openedRef.current = false;
    };
  }, [provider, signUrl]);

  // ===== HelloSign path: lazy-load embed script then open =====
  useEffect(() => {
    if (provider !== "hellosign") return;
    if (window.HelloSign && !openedRef.current) {
      openHelloSign(signUrl, isTestMode);
      openedRef.current = true;
    }
    return () => {
      try {
        window.HelloSign?.close?.();
      } catch {}
      openedRef.current = false;
    };
  }, [provider, signUrl, isTestMode]);

  const handleLoad = () => {
    if (provider !== "hellosign") return;
    if (!openedRef.current) {
      openHelloSign(signUrl, isTestMode);
      openedRef.current = true;
    }
  };

  const handleError = () => {
    // eslint-disable-next-line no-console
    console.error("[SignClient] Failed to load HelloSign embed script");
  };

  // UI:
  // - DocuSign: render a tiny message while the browser navigates
  // - HelloSign: render the script loader (embed opens in-place)
  // - Unknown: just attempt a top-level navigation as a fallback
  if (provider === "docusign") {
    return (
      <div className="text-sm text-slate-600">
        Opening signer…
      </div>
    );
  }

  if (provider === "hellosign") {
    return (
      <Script
        src="https://cdn.hellosign.com/public/js/hellosign-embedded.LATEST.min.js"
        strategy="afterInteractive"
        onLoad={handleLoad}
        onError={handleError}
      />
    );
  }

  // Fallback: unknown provider → try direct nav (acts like DocuSign branch)
  useEffect(() => {
    if (!signUrl || openedRef.current) return;
    openedRef.current = true;
    try {
      window.location.assign(signUrl);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[SignClient] Fallback navigation failed", e);
    }
  }, [signUrl]);

  return <div className="text-sm text-slate-600">Opening signer…</div>;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
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
  console.log("[SignClient] opening HelloSign", {
    clientIdPrefix: CLIENT_ID.slice(0, 6),
    clientIdSuffix: CLIENT_ID.slice(-6),
    signatureIdMasked: maskedSig,
    isTestMode,
    origin,
  });

  try {
    const opts: any = {
      url: signUrl,
      clientId: CLIENT_ID,
      uxVersion: 2,
      allowCancel: true,
      skipDomainVerification: !!isTestMode, // only in test mode
      parentUrl: origin,
      parent_url: origin, // snake_case fallback
    };

    window.HelloSign?.open(opts);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[SignClient] HelloSign.open failed", e);
  }
}
