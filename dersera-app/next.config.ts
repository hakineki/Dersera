import type { NextConfig } from "next";
import { guvenlikBasliklari } from "./lib/guvenlikBasliklari";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: guvenlikBasliklari(process.env.NODE_ENV !== "production") }];
  },
};

export default nextConfig;
