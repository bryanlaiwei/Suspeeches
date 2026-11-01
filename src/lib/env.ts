/** Server-side environment. Read lazily so missing keys only matter when a feature is used. */
export const env = {
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY ?? "";
  },
  get elevenLabsKey() {
    return process.env.ELEVENLABS_API_KEY ?? "";
  },
  get agentboxdKey() {
    return process.env.AGENTBOXD_API_KEY ?? "";
  },
  get judgeModel() {
    return process.env.JUDGE_MODEL || "claude-haiku-5-5";
  },
  get gapModel() {
    return process.env.GAP_MODEL || "claude-haiku-5-5";
  },
  get summaryModel() {
    return process.env.SUMMARY_MODEL || "claude-opus-5-5";
  },
  agentId(scenario: string): string {
    const key = `ELEVENLABS_AGENT_ID_${scenario.toUpperCase()}`;
    return process.env[key] ?? "";
  },
};

/**
 * MOCK_MODE is a development aid: canned LLM output and a scripted NPC so the UI runs without keys.
 * It turns on when MOCK_MODE=1, or when ANTHROPIC_API_KEY is missing outside production.
 */
export function llmMock(): boolean {
  if (process.env.MOCK_MODE === "1") return true;
  return !env.anthropicKey && process.env.NODE_ENV !== "production";
}

export function voiceMock(): boolean {
  if (process.env.MOCK_MODE === "1") return true;
  return !env.elevenLabsKey && process.env.NODE_ENV !== "production";
}
