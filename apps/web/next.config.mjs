/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "development" ? undefined : "export",
  images: { unoptimized: true },
  trailingSlash: true,
  transpilePackages: ["@cstf/core"],
  // Production serves the exported site through nginx; next dev proxies the API.
  ...(process.env.NODE_ENV === "development" ? {
    async rewrites() {
      return [{ source: "/api/:path*", destination: "http://127.0.0.1:3001/api/:path*" }];
    },
  } : {}),
};

export default nextConfig;
