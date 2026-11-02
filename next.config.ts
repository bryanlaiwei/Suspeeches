import { watch } from "node:fs";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { generatePrompts, PROMPTS_DIR } from "./scripts/gen-prompts";

const nextConfig: NextConfig = {
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

/** Prompts are compiled into src/lib/prompts.generated.ts; in dev, recompile when one changes. */
export default function config(phase: string): NextConfig {
  generatePrompts();
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    watch(PROMPTS_DIR, { recursive: true }, (_, file) => {
      if (!file?.endsWith(".md")) return;
      try {
        if (generatePrompts()) console.log(`prompts: recompiled after ${file} changed`);
      } catch (err) {
        console.error("prompts:", err instanceof Error ? err.message : err);
      }
    });
  }
  return nextConfig;
}
