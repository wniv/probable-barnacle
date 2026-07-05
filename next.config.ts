import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Replit's Autoscale build container appears to report more CPUs than it has memory for,
    // which crashed the Next.js build worker outright (not a code error — a raw process exit).
    // Capping workers and sizing them by actual memory avoids over-parallelizing the build.
    cpus: 2,
    memoryBasedWorkersCount: true,
    // Trades a bit of compile time for materially lower peak memory in the webpack compiler —
    // the build worker was still getting OOM-killed with just the cpus cap above.
    webpackMemoryOptimizations: true,
  },
  webpack: (config, { dev }) => {
    if (config.cache && !dev) {
      config.cache = Object.freeze({ type: "memory" });
    }
    return config;
  },
  // `next dev` uses Turbopack by default in Next 16; the webpack config above only applies to
  // the explicit `next build --webpack`. Declaring an (empty) turbopack config tells Next the
  // Turbopack dev path is intentional, silencing the otherwise-fatal "webpack config with no
  // turbopack config" error that was breaking `npm run dev`.
  turbopack: {},
};

export default nextConfig;
