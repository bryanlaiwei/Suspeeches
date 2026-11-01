import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompt files are read from ./prompts at runtime; make sure they ship with the server build.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Permissions-Policy", value: "microphone=(self)" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
