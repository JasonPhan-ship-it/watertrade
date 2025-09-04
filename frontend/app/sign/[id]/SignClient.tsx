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
  if (typeof window !== "undefined" && window.HelloSign) return window.HelloSign;

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${HELLOSIGN_CDN}"]`);
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.HelloSign) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("HelloSign script failed to load")), { once: true });
    });
    return window.HelloSign;
  }

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = HELLOSIGN_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("HelloSign script failed to load"));
    document.head.appendChild(s);
  });

  if (!window.HelloSign) throw new Error("HelloSign global not found after script load");
  return window.HelloSign;
}

export default function SignClient({ signUrl, isTestMode }: { signUrl: string; isTestMode: boolean }) {
  const openedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (openedRef.current) return;
        if (!signUrl) return console.error("[sign] Missing signUrl");

        const clientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID;
        if (!clientId) return console.error("[sign] NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID is not set");

        const host = window.location.hostname;
        const skip = Boolean(isTestMode && !isAllowedProdHost(host));

        const HS = await ensureHelloSign();
        if (cancelled) return;

        // IMPORTANT: per current API, don't pass clientId to the constructor.
        // Create the client with no args, then pass clientId inside open(...).
        const client = new HS();

        // Optional verbose logs while you’re testing
        try {
          if (isTestMode) localStorage.debug = "hellosign-embedded:*";
        } catch {}

        client.on?.("error", (e: any) => console.error("[sign/error]", e));
        client.on?.("open", (e: any) => console.info("[sign/event] open", e));
        client.on?.("close", () => console.info("[sign/event] close"));

        client.open(signUrl, {
          clientId,                   // <-- pass clientId HERE
          skipDomainVerification: skip,
          allowCancel: true,
          // uxVersion: 2,            // uncomment if you need v2 UI
          // container: someElement,  // (optional) embed inline instead of modal
          debug: true,
          timeout: 30000,
        });

        openedRef.current = true;

        const mask = (s: string) => (s && s.length > 8 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);
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
      // window.HelloSign?.close?.();
    };
  }, [signUrl, isTestMode]);

  return null;
}
