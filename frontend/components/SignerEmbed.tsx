// components/SignerEmbed.tsx
"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef } from "react";

const IS_PROD = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
const RAW_CLIENT_ID = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID || "";
const CLIENT_ID = RAW_CLIENT_ID.trim();

type Props = { signUrl: string };

type Provider = "docusign" | "hellosign" | "unknown";

function detectProvider(url: string): Provider {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("docusign.com") || host.includes("docusign.net")) return "docusign";
    if (
      host.includes("hellosign.com") ||
      host.includes("dropboxsign.com") ||
      host.includes("sign.dropbox.com") ||
      host === "cdn.hellosign.com"
    ) {
      return "hellosign";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export default function SignerEmbed({ signUrl }: Props) {
  const provider = useMemo(() => detectProvider(signUrl), [signUrl]);
  const openedRef = useRef(false);

  // ----- DocuSign: navigate top-level (no embed script) -----
  useEffect(() => {
    if (provider !== "docusign") return;
    if (!signUrl || openedRef.current) return;
    openedRef.current = true;

    // eslint-disable-next-line no-console
    console.log("[SignerEmbed] Navigating to DocuSign…", { host: safeHost(signUrl) });
    window.location.assign(signUrl);

    return () => {
      openedRef.current = false;
    };
  }, [provider, signUrl]);

  // ----- Fallback for unknown providers: attempt top-level navigation -----
  useEffect(() => {
    if (provider !== "unknown") return;
    if (!signUrl || openedRef.current) return;
    openedRef.current = true;

    try {
      window.location.assign(signUrl);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[SignerEmbed] Fallback navigation failed", e);
    }

    return () => {
      openedRef.current = false;
    };
  }, [provider, signUrl]);

  // ----- HelloSign: if script is already present, open immediately -----
  useEffect(() => {
    if (provider !== "hellosign") return;
    if ((window as any)?.HelloSign && !openedRef.current) {
      openHelloSign(signUrl);
      openedRef.current = true;
    }
    return () => {
      try {
        (window as any)?.HelloSign?.close?.();
      } catch {}
      openedRef.current = false;
    };
  }, [provider, signUrl]);

  const onHelloSignLoad = () => {
    if (provider !== "hellosign") return;
    if (!openedRef.current) {
      openHelloSign(signUrl);
      openedRef.current = true;
    }
  };

  const onHelloSignError = () => {
    // eslint-disable-next-line no-console
    console.error("[SignerEmbed] Failed to load HelloSign embed script");
  };

  // Render per provider
  if (provider === "docusign") {
    return <div className="text-sm text-slate-600">Opening signer…</div>;
  }

  if (provider === "hellosign") {
    return (
      <Script
        src="https://cdn.hellosign.com/public/js/hellosign-embedded.LATEST.min.js"
        strategy="afterInteractive"
        onLoad={onHelloSignLoad}
        onError={onHelloSignError}
      />
    );
  }

  return <div className="text-sm text-slate-600">Opening signer…</div>;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function openHelloSign(signUrl: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!CLIENT_ID) {
    // eslint-disable-next-line no-console
    console.error(
      "[SignerEmbed] Missing NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID. The embed will fail with 'Missing/Invalid parameter: client_id'."
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log("[SignerEmbed] Opening HelloSign embed", {
    clientIdPrefix: CLIENT_ID.slice(0, 6),
    clientIdSuffix: CLIENT_ID.slice(-6),
    isProd: IS_PROD,
    origin,
  });

  try {
    (window as any).HelloSign?.open({
      url: signUrl,                 // from /api/sign-url
      clientId: CLIENT_ID,          // REQUIRED for HelloSign
      uxVersion: 2,
      allowCancel: true,
      skipDomainVerification: !IS_PROD, // ok in dev/test only
      parentUrl: origin,
      parent_url: origin,           // some integrations read snake_case
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[SignerEmbed] HelloSign.open failed", e);
  }
}
