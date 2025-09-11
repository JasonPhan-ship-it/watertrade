// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // scope the CSP just to the sign pages
        source: "/sign/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // HelloSign embed script
              "script-src 'self' 'unsafe-inline' https://cdn.hellosign.com",
              // HelloSign APIs used by the embed
              "connect-src 'self' https://api.hellosign.com https://app.hellosign.com",
              // Allow HelloSign to be framed by your page
              "frame-src https://app.hellosign.com https://*.hellosign.com",
              // Images served by HelloSign inside the iframe
              "img-src 'self' data: blob: https://*.hellosign.com",
              // Inline styles are common in embeds; keep if needed
              "style-src 'self' 'unsafe-inline'",
            ].join("; "),
          },
          // Note: X-Frame-Options controls *your page* being framed.
          // You do NOT need to change it to frame HelloSign.
          // Just ensure you’re not sending X-Frame-Options: DENY on /sign/*.
        ],
      },
    ];
  },
};

export default nextConfig;
