import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const nextConfig = {
  output: 'export',
  distDir: 'out',
  assetPrefix: './',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
