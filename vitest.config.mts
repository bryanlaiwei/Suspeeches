import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

/** `npm run test:live` runs the fixed transcript through the real judge model with your .env.local keys. */
const live = process.env.JUDGE_LIVE === "1";
if (live && existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Unit tests never call a real API: canned LLM output unless the live judge check was asked for.
    env: live ? {} : { MOCK_MODE: "1" },
  },
});
