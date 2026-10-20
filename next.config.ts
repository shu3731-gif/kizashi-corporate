import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // 静的書き出し（Cloudflare Pages 用）。out/ に生成される
  turbopack: { root: process.cwd() },
  distDir: process.env.KIZASHI_BUILD_DIR || ".next",
  devIndicators: false,
};

export default nextConfig;
