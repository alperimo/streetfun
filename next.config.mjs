/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the generated Next.js type reference stable during normal dev/build
  // runs. Dedicated verification runs can still override this with
  // NEXT_DIST_DIR (for example, .next-verification).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "arweave.net",
      },
    ],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // The native bigint-buffer loader cannot be resolved from a Next bundle.
      // Its browser build is the package's supported pure-JS implementation.
      "bigint-buffer": "bigint-buffer/dist/browser.js",
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
