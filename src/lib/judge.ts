import { characterName, formatClaims, formatProfile, formatScene, formatTranscript } from "./context";
import { env, llmMock } from "./env";
import { structuredCall, type RawCaller } from "./llm";
import { mockJudge } from "./mock";
import { render } from "./prompts";
import { JudgeRawSchema, JudgeResultSchema, type Profile, type Setup } from "./schemas";
import { normalizeJudge } from "./scoring";
import { describeSignals } from "./timing";
import type { ClaimState, DeliverySignals, JudgeResult, Turn } from "./types";

export interface JudgeInput {
  profile: Profile;
  setup: Setup;
  /** Full transcript including the turn being judged (last user turn). */
  transcript: Turn[];
  turn: Turn & { signals: DeliverySignals };
  previousClaims: ClaimState[];
  userTurnNumber: number;
}

export interface JudgeOutput {
  result: JudgeResult;
  degraded: boolean;
}

export function judgeSystemPrompt(input: Pick<JudgeInput, "profile" | "setup">): string {
  return render("judge.v1", {
    real_profile: formatProfile(input.profile),
    alias: input.setup.alias,
    claims: formatClaims(input.setup.claims),
    scene: formatScene(input.setup),
  });
}

export function judgeUserPrompt(input: JudgeInput): string {
  const npc = characterName(input.setup);
  const before = input.transcript.filter((t) => t.index < input.turn.index);
  return [
    `<transcript_so_far>\n${formatTranscript(before, npc)}\n</transcript_so_far>`,
    `<claim_status_before_this_turn>\n${input.previousClaims.map((c) => `- ${c.claim}: ${c.status}`).join("\n")}\n</claim_status_before_this_turn>`,
    `<latest_player_turn index="${input.turn.index}">\n${input.turn.text}\n</latest_player_turn>`,
    `<delivery_signals>\n${describeSignals(input.turn.signals)}\n</delivery_signals>`,
    "Score the latest player turn.",
  ].join("\n\n");
}

/**
 * Judge one user turn. Never throws: on repeated failure it returns a neutral, degraded result
 * so the live scene keeps going.
 */
export async function judgeTurn(input: JudgeInput, call?: RawCaller): Promise<JudgeOutput> {
  const claims = input.setup.claims;
  try {
    const raw =
      llmMock() && !call
        ? mockJudge(input.turn.text, input.turn.signals, claims, input.userTurnNumber)
        : (
            await structuredCall(
              {
                label: "judge",
                model: env.judgeModel,
                system: judgeSystemPrompt(input),
                user: judgeUserPrompt(input),
                schema: JudgeRawSchema,
                maxTokens: 2000,
                effort: "low",
              },
              call,
            )
          ).data;
    const result = JudgeResultSchema.parse(normalizeJudge(raw, claims));
    // Contradicted claims never recover.
    result.claims_status = result.claims_status.map((c, i) =>
      input.previousClaims[i]?.status === "contradicted" ? { ...c, status: "contradicted" } : c,
    );
    return { result, degraded: false };
  } catch (err) {
    console.error("[judge] falling back to neutral result:", err instanceof Error ? err.message : err);
    return {
      degraded: true,
      result: {
        delta: 0,
        reasons: ["The judge missed this turn."],
        categories: { consistency: 5, specificity: 5, plausibility: 5, delivery: 5 },
        claims_status: input.previousClaims.map((c) => ({ claim: c.claim, status: c.status })),
        next_probe: "",
      },
    };
  }
}

/** The text we send to the NPC as a contextual update. It never mentions scores. */
export function npcHintFor(nextProbe: string): string {
  if (!nextProbe) return "";
  return `Background note for your next question (do not read aloud or acknowledge): ${nextProbe}`;
}
