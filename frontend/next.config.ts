import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // The dashboard talks to the API through this proxy, so requests are same-origin
  // and the httpOnly session cookie just works.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }] },
};

export default nextConfig;
