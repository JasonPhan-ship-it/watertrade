// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Scope CSP to the signing pages only
    return [
      {
        source: "/sign/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",

              // Your app + Clerk + DocuSign endpoints
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

              // Allow DocuSign iframe
              [
                "frame-src",
                "https://demo.docusign.net",
                "https://app.docusign.com",
                "https://*.docusign.net",
                "https://*.docusign.com",
              ].join(" "),

              // Images from DocuSign iframe or your app
              "img-src 'self' data: blob: https://*.docusign.net https://*.docusign.com",

              // Styles
              "style-src 'self' 'unsafe-inline'",

              // Clerk scripts (you do not need DocuSign scripts)
              [
                "script-src 'self' 'unsafe-inline'",
                "https://*.clerk.com",
                "https://*.clerk.dev",
                "https://*.clerk.accounts.dev",
              ].join(" "),

              // Clerk uses workers from blob:
              "worker-src 'self' blob:",
            ].join("; "),
          },
          // Ensure you are NOT sending X-Frame-Options: DENY on /sign/*
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    // Do NOT alias docusign-esign to a dist file; versions differ in layout.
    // Instead, keep it external on the server so webpack doesn’t bundle it.
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

export default nextConfig;
