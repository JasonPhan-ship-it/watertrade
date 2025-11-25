import withPWAInit from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Scope CSP to the signing pages only
        source: "/sign/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",

              // Network requests from your page (fetch/XHR, SSE, websockets)
              [
                "connect-src 'self'",
                // DocuSign (demo + prod + account endpoints)
                "https://demo.docusign.net",
                "https://app.docusign.com",
                "https://account-d.docusign.com",
                "https://account.docusign.com",
                "https://*.docusign.net",
                "https://*.docusign.com",
                // Clerk
                "https://*.clerk.com",
                "https://*.clerk.dev",
                "https://*.clerk.accounts.dev",
              ].join(" "),

              // If you embed DocuSign in an <iframe>
              [
                "frame-src 'self'",
                "https://demo.docusign.net",
                "https://app.docusign.com",
                "https://*.docusign.net",
                "https://*.docusign.com",
              ].join(" "),

              // If DocuSign or your page submits forms/POSTs to DocuSign
              "form-action 'self' https://*.docusign.net https://*.docusign.com",

              // Images (including those loaded inside the embedded DocuSign UI)
              "img-src 'self' data: blob: https://*.docusign.net https://*.docusign.com",

              // Fonts/CSS
              "font-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",

              // Scripts: your app + Clerk (DocuSign does not require you to host their JS)
              [
                "script-src 'self' 'unsafe-inline'",
                "https://*.clerk.com",
                "https://*.clerk.dev",
                "https://*.clerk.accounts.dev",
              ].join(" "),

              // Workers (Clerk may use blob:)
              "worker-src 'self' blob:",
            ].join("; "),
          },
          // Do NOT set X-Frame-Options: DENY here; it would block your page from embedding anything.
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    // Keep docusign-esign external on the server to avoid bundling differences.
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(({ request }, cb) => {
        if (request && /^docusign-esign(\/.*)?$/.test(request)) {
          return cb(null, "commonjs " + request);
        }
        cb();
      });
    }
    return config;
  },
};

const enablePWAInDev = process.env.ENABLE_PWA_IN_DEV === "true";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development" && !enablePWAInDev,
  register: true,
  skipWaiting: true,
  runtimeCaching,
  fallbacks: {
    document: "/offline.html",
  },
});

export default withPWA(nextConfig);
