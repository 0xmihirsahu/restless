const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

module.exports = nextConfig;
