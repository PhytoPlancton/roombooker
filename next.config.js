/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["mongodb"],
  experimental: {
    serverActions: { allowedOrigins: ["roombooker.nmt.ovh"] }
  }
};

module.exports = nextConfig;
