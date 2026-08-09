import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The dev-only badge sits in the bottom-left corner and would otherwise show
  // up in every screenshot the reference comparison takes.
  devIndicators: false,
}

export default nextConfig
