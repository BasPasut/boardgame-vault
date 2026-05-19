import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // All game images are served from the /public folder (same origin).
    // No remote patterns needed. The localPatterns list lets Next.js Image
    // serve optimised (WebP/AVIF) versions from /_next/image at runtime.
    localPatterns: [
      { pathname: "/images/**" },
      { pathname: "/audio/**" },
    ],
    // At build time on Vercel, Next.js will also generate optimised sizes.
    // These are the widths we actually render images at (×1 and ×2 for retina).
    deviceSizes: [320, 480, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 256, 320, 480],
  },
};

export default nextConfig;
