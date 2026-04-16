import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["lindy.b-average.com"],
  async rewrites() {
    return [
      { source: "/hewie", destination: "/" },
      { source: "/hewie/:path*", destination: "/:path*" },
    ];
  },
  async headers() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
          { key: "Surrogate-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
