// app/sign/[id]/SignClient.tsx
"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    HelloSign?: any;
  }
}

function isAllowedProdHost(host: string) {
  return host === "watertraders.com" || host.endsWith(".watertraders.com");
}

const HELLOSIGN_CDN = "https://cdn.hellosign.com/public/js/hellosign-embedded.min.js";

async function ensureHelloSign(): Promise<any> {
  // Already loaded?
  if (typeof window !== "undefined" && window.HelloSign) {
    return window.HelloSign;
  }

  // If a script tag is already present, wait for it
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${HELLOSIGN_CDN}"]`);
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if ((window as any).HelloSign) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("HelloSign script failed to load")), { once: true });
    });
    return window.HelloSign;
  }

  // Inject the script
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = HELLOSIGN_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("HelloSign script failed to load"));
    document.head.appendChild(s);
  });

  if (!window.HelloSign) {
    throw new Error("HelloSign global not found after script load");
  }
  return window.HelloSign;
}

export default function SignClient({ signUrl, isTestMode }: { signUrl: string; isTestMode: boolean }) {
  const openedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (openedRef.current) return; // guard against double-open
        if (!signUrl) {
          console.error("[sign] Missing signUrl");
          return;
        }

        const clientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID;
        if (!clientId) {
          console.error("[sign] NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID is not set");
          return;
        }

        const host = window.location.hostname;
        const skip = Boolean(isTestMode && !isAllowedProdHost(host));

        // Ensure HelloSign is available (CDN)
        const HS = await ensureHelloSign();
        if (cancelled) return;

        const client = new HS({ clientId });
        client.open(signUrl, {
          skipDomainVerification: skip, // key for previews/local when test_mode=1
          allowCancel: true,
          // uxVersion: 2, // uncomment if you need a specific UX version
        });

        openedRef.current = true;

        // Helpful console diagnostics (masked clientId)
        const mask = (s: string) => (s && s.length > 8 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);
        // eslint-disable-next-line no-console
        console.info("[sign/open]", {
          host,
          isTestMode,
          skipDomainVerification: skip,
          clientId: mask(clientId),
        });
      } catch (err) {
        console.error("[sign] failed to open embed:", err);
      }
    })();

    return () => {
      cancelled = true;
      // If you want to force-close on unmount and the API supports it:
      // try { window.HelloSign?.close?.(); } catch {}
    };
  }, [signUrl, isTestMode]);

  return null;
}
