// next.config.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Scope the stricter CSP to signing pages only
    return [
      {
        source: "/sign/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              // sensible defaults
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",

              // your page makes fetch/XHR to your API, Clerk, and DocuSign endpoints
              [
                "connect-src 'self'",
                "https://account-d.docusign.com",
                "https://account.docusign.com",
                "https://demo.docusign.net",
                "https://app.docusign.com",
                "https://*.docusign.net",
                "https://*.docusign.com",
                "https://*.clerk.com",
                "https://*.clerk.dev",
                "https://*.clerk.accounts.dev",
              ].join(" "),

              // embed DocuSign signing view in an <iframe>
              [
                "frame-src",
                "https://demo.docusign.net",
                "https://app.docusign.com",
                "https://*.docusign.net",
                "https://*.docusign.com",
              ].join(" "),

              // images loaded inside the iframe or by your app
              "img-src 'self' data: blob: https://*.docusign.net https://*.docusign.com",

              // Next + your styles; inline is common for embeds/components
              "style-src 'self' 'unsafe-inline'",

              // Clerk loads its own script; no external DocuSign script needed
              [
                "script-src 'self' 'unsafe-inline'",
                "https://*.clerk.com",
                "https://*.clerk.dev",
                "https://*.clerk.accounts.dev",
              ].join(" "),

              // Clerk workers need this to be able to start from a blob URL
              "worker-src 'self' blob:",
            ].join("; "),
          },
          // Important: Do NOT send X-Frame-Options: DENY on /sign/*, or the DocuSign iframe will be blocked.
        ],
      },
    ];
  },

  // Optional but recommended if you use the DocuSign Node SDK server-side
  webpack: (config, { isServer }) => {
    // Prefer the SDK’s CJS bundle to avoid ESM/bare-import hiccups during build
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'docusign-esign$': require.resolve('docusign-esign/dist/index.js'),
    };

    // Keep the SDK external to reduce bundle size of serverless functions
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(({ request }, cb) => {
        if (request && /^docusign-esign(\/.*)?$/.test(request)) {
          return cb(null, 'commonjs ' + request);
        }
        cb();
      });
    }
    return config;
  },
};

export default nextConfig;
