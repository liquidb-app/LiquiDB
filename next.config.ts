import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  distDir: '.next',
  // Ensure proper output file tracing for Electron
  outputFileTracingRoot: process.cwd(),
  // Disable webpack optimizations that might cause issues in Electron
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Server-side optimizations
      config.externals = config.externals || []
    }
    return config
  },
};

export default nextConfig;
