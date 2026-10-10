import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Für Self-Hosting (Coolify/Docker): minimaler Server unter .next/standalone
  output: "standalone",
};

export default nextConfig;
