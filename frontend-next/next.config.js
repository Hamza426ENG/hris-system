/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Compress output for faster page loads
  compress: true,
  // Generate optimized production source maps
  productionBrowserSourceMaps: false,
  // Optimize page loading
  poweredByHeader: false,
  // NEXT_PUBLIC_API_URL must be set in .env.local (or environment) — no hardcoded fallback
}

module.exports = nextConfig
