/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // NEXT_PUBLIC_API_URL must be set in .env.local (or environment) — no hardcoded fallback
}

module.exports = nextConfig
