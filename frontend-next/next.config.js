/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/hris-nextjs' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/hris-nextjs/' : '',
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_API_URL: 'https://postgres-production-af91.up.railway.app/api',
  },
}
module.exports = nextConfig
