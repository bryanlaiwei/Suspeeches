import { characterName, formatClaims, formatProfile, formatScene, transcriptLines } from "./context";
import { castFor } from "./presets";
import { env, llmMock } from "./env";
import { structuredCall, type PromptBlock, type RawCaller } from "./llm";
import { mockJudge } from "./mock";
import { render } from "./prompts";
import { JudgeRawSchema, JudgeResultSchema, JudgeScoreRawSchema, type JudgeScoreRaw, type Profile, type Setup } from "./schemas";
import { normalizeJudge, normalizeScore, type JudgeScore } from "./scoring";
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

/** Group scenes: who is listening and what each of them can actually judge. */
export function listenersFor(setup: JudgeInput["setup"]): { name: string; expertise: string }[] {
  const cast = castFor(setup);
  return cast.length > 1 ? cast.map((c) => ({ name: c.name, expertise: c.expertise })) : [];
}

function listenersBlock(setup: JudgeInput["setup"]): string {
  const listeners = listenersFor(setup);
  if (!listeners.length) return "There is a single listener. Return `listeners` as an empty array.";
  return [
    "This is a group scene. Each listener can only catch what their own expertise lets them catch:",
    ...listeners.map((l) => `- ${l.name}: knows ${l.expertise}`),
    "",
    "Besides the overall delta (the most alarmed listener's reaction), return one entry per listener in `listeners`, using these exact names, each with its own delta (same -15 to +25 scale) and a reason under 12 words from that listener's point of view:",
    "- Something inside a listener's expertise: they judge it like an expert. Fake jargon, wrong numbers or impossible details hit hard; genuinely specific, correct detail earns real trust.",
    "- Something outside their expertise: they can't tell real from fake detail. They react mostly to delivery, confidence and how the others react, at about a third of the strength.",
    "- Everyone notices contradictions with what was said earlier, long pauses, heavy hedging and dodged questions.",
    "- Small talk that touches no claim: small deltas for everyone.",
    "",
    "next_probe in a group scene: start with the name of the listener whose expertise best covers the weakest claim, then what they should ask, e.g. \"Maya should ask them which state library they used.\" Engineering goes to the engineer, design to the designer, business and money to the business person.",
  ].join("\n");
}

export function judgeSystemPrompt(input: Pick<JudgeInput, "profile" | "setup">): string {
  return render("judge", {
    real_profile: formatProfile(input.profile),
    alias: input.setup.alias,
    claims: formatClaims(input.setup.claims),
    scene: formatScene(input.setup),
    listeners: listenersBlock(input.setup),
  });
}

/**
 * The judge's user message, split into blocks for prompt caching. Within a session the system
 * prompt never changes and the transcript only grows, so the transcript goes first, one block per
 * line, with a cache breakpoint after the last line: the next turn's request starts with the same
 * blocks plus a few new lines, so it reads everything up to here from the cache. What changes every
 * turn (claim status, the turn itself, its timing) comes after the breakpoint.
 *
 * The whole transcript is sent (up to JUDGE_MAX_LINES), not a sliding window: dropping the oldest
 * line would change the start of the prompt and miss the cache on every turn.
 */
export function judgeUserBlocks(input: JudgeInput): PromptBlock[] {
  const npc = characterName(input.setup);
  const before = input.transcript.filter((t) => t.index < input.turn.index).slice(-JUDGE_MAX_LINES);
  const lines = before.length ? transcriptLines(before, npc) : ["(nothing said yet)"];
  return [
    { text: "<transcript_so_far>" },
    ...lines.map((line, i) => ({ text: `\n${line}`, cache: i === lines.length - 1 })),
    {
      text: [
        "\n</transcript_so_far>",
        `<claim_status_before_this_turn>\n${input.previousClaims.map((c) => `- ${c.claim}: ${c.status}`).join("\n")}\n</claim_status_before_this_turn>`,
        `<latest_player_turn index="${input.turn.index}">\n${input.turn.text}\n</latest_player_turn>`,
        `<delivery_signals>\n${describeSignals(input.turn.signals)}\n</delivery_signals>`,
        "Score the latest player turn.",
      ].join("\n\n"),
    },
  ];
}

/** Far more than a 10-minute scene produces; only there to bound a runaway session. */
export const JUDGE_MAX_LINES = 400;

/**
 * Judge calls run one at a time per session and the scene end waits for them, so a slow call holds
 * up every later turn. Fail fast instead: no SDK retries, and structuredCall's single retry (which
 * also covers timeouts) caps a turn at about 2 × JUDGE_TIMEOUT_MS before the neutral fallback.
 */
export const JUDGE_TIMEOUT_MS = 12_000;

/**
 * Judge one user turn. Never throws: on repeated failure it returns a neutral, degraded result
 * so the live scene keeps going.
 *
 * The reply is streamed, and `onScore` is called once, as soon as the scores have come in (they
 * are the first fields the model writes), so the meter can move about a second and a half before
 * the rest of the reply (reasons, claims, next question) is done. The result always carries that
 * same score: if the reply then breaks and the retry scores differently, the first score stands.
 */
export async function judgeTurn(input: JudgeInput, call?: RawCaller, onScore?: (score: JudgeScore) => void): Promise<JudgeOutput> {
  const claims = input.setup.claims;
  const listenerNames = listenersFor(input.setup).map((l) => l.name);
  const got: { score: JudgeScore | null } = { score: null };
  const score = (raw: JudgeScoreRaw) => {
    if (got.score) return;
    got.score = normalizeScore(raw, listenerNames);
    onScore?.(got.score);
  };
  try {
    const raw =
      llmMock() && !call
        ? mockJudge(input.turn.text, input.turn.signals, claims, input.userTurnNumber, listenersFor(input.setup))
        : (
            await structuredCall(
              {
                label: "judge",
                model: env.judgeModel,
                system: judgeSystemPrompt(input),
                cacheSystem: true,
                user: judgeUserBlocks(input),
                schema: JudgeRawSchema,
                maxTokens: 2000,
                effort: "low",
                timeoutMs: JUDGE_TIMEOUT_MS,
                maxRetries: 0,
                onText: (soFar) => {
                  if (got.score) return;
                  const s = partialScore(soFar);
                  if (s) score(s);
                },
              },
              call,
            )
          ).data;
    score(raw); // a reply that didn't stream (mock, tests) scores here
    const result = JudgeResultSchema.parse({ ...normalizeJudge(raw, claims, listenerNames), ...got.score });
    // Contradicted claims never recover.
    result.claims_status = result.claims_status.map((c, i) =>
      input.previousClaims[i]?.status === "contradicted" ? { ...c, status: "contradicted" } : c,
    );
    return { result, degraded: false };
  } catch (err) {
    console.error("[judge] falling back to neutral result:", err instanceof Error ? err.message : err);
    return {
      // With a score already in, only the notes are missing: the turn still counts.
      degraded: !got.score,
      result: {
        delta: 0,
        reasons: [got.score ? "The judge's notes for this turn didn't come through." : "The judge missed this turn."],
        categories: { consistency: 5, specificity: 5, plausibility: 5, delivery: 5 },
        claims_status: input.previousClaims.map((c) => ({ claim: c.claim, status: c.status })),
        next_probe: "",
        listeners: listenerNames.map((name) => ({ name, delta: 0, reason: "" })),
        ...got.score,
      },
    };
  }
}

/**
 * The scores from a reply that is still streaming in: null until every field before `reasons`
 * (delta, then listeners) is complete, or if they don't parse.
 */
export function partialScore(soFar: string): JudgeScoreRaw | null {
  const fields = completedFields(soFar);
  if (!fields || !("listeners" in fields)) return null;
  const parsed = JudgeScoreRawSchema.safeParse(fields);
  return parsed.success ? parsed.data : null;
}

/** A JSON object cut off part way through: its top-level fields up to the last one that's complete. */
function completedFields(text: string): Record<string, unknown> | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastComma = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 1) lastComma = i;
  }
  if (lastComma < 0) return null;
  try {
    const value: unknown = JSON.parse(`${text.slice(0, lastComma)}}`);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The text we send to the NPC as a contextual update. It never mentions scores. */
export function npcHintFor(nextProbe: string): string {
  if (!nextProbe) return "";
  return `Background note for your next question (do not read aloud or acknowledge): ${nextProbe}`;
}
