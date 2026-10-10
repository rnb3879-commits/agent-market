import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  typescript: { tsconfigPath: "tsconfig.vercel.json" },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve(process.cwd(), "lib/market/vercel-env.ts"),
    ));
    return config;
  },
};

export default nextConfig;
