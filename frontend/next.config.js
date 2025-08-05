/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['images.clerk.dev'],
  },
  // Ensure proper routing
  trailingSlash: false,
  async redirects() {
    return [];
  },
}

module.exports = nextConfig 