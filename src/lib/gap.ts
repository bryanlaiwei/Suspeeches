import { formatClaims, formatProfile, formatScene } from "./context";
import { env, llmMock } from "./env";
import { structuredCall } from "./llm";
import { mockGap, mockSuggest } from "./mock";
import { render } from "./prompts";
import { presetFor } from "./presets";
import { GapRawSchema, SuggestRawSchema, type GapResult, type Profile, type ScenarioId } from "./schemas";
import { clamp, gapMultiplier } from "./scoring";

/** Pre-scene larp-gap estimate → difficulty multiplier. */
export async function estimateGap(profile: Profile, alias: string, claims: string[]): Promise<GapResult> {
  const raw = llmMock()
    ? mockGap(claims)
    : (
        await structuredCall({
          label: "gap",
          model: env.gapModel,
          system: render("gap", {
            real_profile: formatProfile(profile),
            alias: alias || profile.name,
            claims: formatClaims(claims),
          }),
          user: "Estimate the larp gap.",
          schema: GapRawSchema,
          maxTokens: 1500,
          effort: "low",
        })
      ).data;
  const gapScore = clamp(Math.round(raw.gap_score), 0, 100);
  return {
    gapScore,
    multiplier: gapMultiplier(gapScore),
    rationale: raw.rationale,
    hardestClaims: raw.hardest_claims.slice(0, 3),
  };
}

/** Claim ideas based on the real profile and the scene. */
export async function suggestClaims(profile: Profile, scenarioId: ScenarioId, existing: string[]) {
  if (llmMock()) return mockSuggest().suggestions;
  const preset = presetFor(scenarioId);
  const { data } = await structuredCall({
    label: "suggest",
    model: env.gapModel,
    system: render("suggest", {
      real_profile: formatProfile(profile),
      scene: formatScene({
        scenarioId,
        alias: profile.name,
        claims: ["-"],
        goal: preset.defaultGoal,
        timeLimitSec: 300,
      }),
      existing: existing.length ? formatClaims(existing) : "(none)",
    }),
    user: "Suggest claims.",
    schema: SuggestRawSchema,
    maxTokens: 1500,
    effort: "low",
  });
  return data.suggestions.slice(0, 6);
}
