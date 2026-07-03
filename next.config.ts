import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Replit's Autoscale build container appears to report more CPUs than it has memory for,
    // which crashed the Next.js build worker outright (not a code error — a raw process exit).
    // Capping workers and sizing them by actual memory avoids over-parallelizing the build.
    cpus: 2,
    memoryBasedWorkersCount: true,
  },
};

export default nextConfig;
