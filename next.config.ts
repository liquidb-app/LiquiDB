import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export configuration
  output: 'export',
  
  // Leading slash required for next/font validation
  // Works with Electron app:// protocol
  assetPrefix: '/',
  
  // Trailing slash for better static hosting compatibility
  trailingSlash: true,
  
  // Image optimization disabled for static export
  images: {
    unoptimized: true,
  },
  
  // Disable features incompatible with static export
  // (Next.js automatically handles this when output: 'export' is set)
  // Static export output directory defaults to 'out/' which is correct for Electron
};

export default nextConfig;

