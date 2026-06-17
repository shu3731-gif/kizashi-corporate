import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // 静的書き出し（Cloudflare Pages 用）。out/ に生成される
};

export default nextConfig;
