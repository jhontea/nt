import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: ['192.168.68.107'],
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'http://localhost:8100/:path*',
      },
    ]
  },
}
export default nextConfig
