/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright", "playwright-core", "mongodb"],
  experimental: {
    serverActions: { allowedOrigins: ["rooms.nmt.ovh"] }
  }
};

module.exports = nextConfig;
