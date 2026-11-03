/**
 * The judge's output contract, folded in from the old scripts/test-judge.ts.
 *
 *   npm test            # canned judge (MOCK_MODE), no API calls
 *   npm run test:live   # the same fixed transcript through the real JUDGE_MODEL (.env.local keys)
 */
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/transcript.json";
import { judgeTurn, judgeUserBlocks, JUDGE_TIMEOUT_MS, type JudgeInput } from "./judge";
import { structuredCall, toMessageParams, type RawCaller } from "./llm";
import { JudgeRawSchema, JudgeResultSchema, ProfileSchema, SetupSchema } from "./schemas";
import { appliedDelta, applyDelta, START_SUSPICION } from "./scoring";
import { deliverySignals } from "./timing";
import type { ClaimState, Turn } from "./types";

const live = process.env.JUDGE_LIVE === "1";
const profile = ProfileSchema.parse(fixture.profile);
const setup = SetupSchema.parse(fixture.setup);
const initialClaims = (): ClaimState[] => setup.claims.map((claim) => ({ claim, status: "untested" }));

function userTurn(text: string, timing: { responseLatencyMs: number; speechMs: number }, index: number) {
  const t = { ...timing, tSec: index * 15 };
  return { index, role: "user" as const, text, tSec: t.tSec, signals: deliverySignals(text, t) };
}

function inputFor(text: string): JudgeInput {
  const turn = userTurn(text, { responseLatencyMs: 500, speechMs: 1000 }, 1);
  return { profile, setup, transcript: [turn], turn, previousClaims: initialClaims(), userTurnNumber: 1 };
}

const validRaw = JSON.stringify({
  delta: 80,
  reasons: ["You contradicted yourself."],
  categories: { consistency: 14, specificity: -2, plausibility: 3.6, delivery: 5 },
  claims_status: setup.claims.map((claim) => ({ claim, status: "contradicted" })),
  next_probe: "Ask which Go version they used.",
  listeners: [],
});
const request = { label: "test", model: "x", system: "", user: "", schema: JudgeRawSchema, maxTokens: 10, effort: "low" as const };

describe("structuredCall", () => {
  it("retries once on invalid JSON, then succeeds", async () => {
    let calls = 0;
    const flaky: RawCaller = async () => (++calls === 1 ? "not json {" : validRaw);
    const { attempts } = await structuredCall(request, flaky);
    expect(attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("gives up after the second invalid answer", async () => {
    let calls = 0;
    const broken: RawCaller = async () => (calls++, "{}");
    await expect(structuredCall(request, broken)).rejects.toThrow();
    expect(calls).toBe(2);
  });
});

describe("judgeTurn", () => {
  it("falls back to a neutral, degraded result after two failures, without throwing", async () => {
    let calls = 0;
    const broken: RawCaller = async () => (calls++, JSON.stringify({ delta: "lots", reasons: [] }));
    const out = await judgeTurn(inputFor("I did it."), broken);
    expect(calls).toBe(2);
    expect(out.degraded).toBe(true);
    expect(out.result.delta).toBe(0);
    JudgeResultSchema.parse(out.result);
  });

  it("asks for a short timeout and no SDK retries, so one slow turn can't stall the scene", async () => {
    const seen: { timeoutMs?: number; maxRetries?: number }[] = [];
    const spy: RawCaller = async (req) => (seen.push({ timeoutMs: req.timeoutMs, maxRetries: req.maxRetries }), validRaw);
    await judgeTurn(inputFor("I did it."), spy);
    expect(seen).toEqual([{ timeoutMs: JUDGE_TIMEOUT_MS, maxRetries: 0 }]);
  });

  it("never lets a contradicted claim recover", async () => {
    const recovering: RawCaller = async () =>
      JSON.stringify({ ...JSON.parse(validRaw), claims_status: setup.claims.map((claim) => ({ claim, status: "held" })) });
    const input = { ...inputFor("Trust me."), previousClaims: setup.claims.map((claim, i) => ({ claim, status: i === 0 ? "contradicted" : "shaky" }) as ClaimState) };
    const out = await judgeTurn(input, recovering);
    expect(out.result.claims_status.map((c) => c.status)).toEqual(["contradicted", "held", "held"]);
  });
});

describe("judge prompt caching", () => {
  /** Inputs for every user turn of the fixture, as the session would send them. */
  function turnsOfFixture(): JudgeInput[] {
    const transcript: Turn[] = [];
    const inputs: JudgeInput[] = [];
    for (const [i, t] of fixture.turns.entries()) {
      if (t.role === "agent") {
        transcript.push({ index: i, role: "agent", text: t.text, tSec: i * 15 });
        continue;
      }
      const turn = userTurn(t.text, t.timing!, i);
      transcript.push(turn);
      inputs.push({ profile, setup, transcript: [...transcript], turn, previousClaims: initialClaims(), userTurnNumber: inputs.length + 1 });
    }
    return inputs;
  }

  it("marks the system prompt and the end of the transcript so far, and nothing after it", async () => {
    const seen: Parameters<RawCaller>[0][] = [];
    const spy: RawCaller = async (req) => (seen.push(req), validRaw);
    await judgeTurn(turnsOfFixture()[1], spy);
    const params = toMessageParams(seen[0]);
    expect(params.system).toEqual([expect.objectContaining({ type: "text", cache_control: { type: "ephemeral" } })]);
    const content = params.messages[0].content as { text: string; cache_control?: unknown }[];
    const marked = content.flatMap((b, i) => (b.cache_control ? [i] : []));
    expect(marked).toHaveLength(1);
    expect(content[marked[0]].text).toMatch(/^\n\[#\d+ /); // the last transcript line
    expect(content.slice(marked[0] + 1).map((b) => b.text).join("")).toContain("<latest_player_turn");
    expect(content.every((b) => b.text.length > 0)).toBe(true); // the API rejects empty text blocks
  });

  it("starts each turn's message with the previous turn's cached blocks, so it reads them from the cache", () => {
    const inputs = turnsOfFixture();
    expect(inputs.length).toBeGreaterThan(2);
    for (let k = 1; k < inputs.length; k++) {
      const prev = judgeUserBlocks(inputs[k - 1]);
      const next = judgeUserBlocks(inputs[k]);
      const end = prev.findIndex((b) => b.cache) + 1;
      expect(next.slice(0, end).map((b) => b.text)).toEqual(prev.slice(0, end).map((b) => b.text));
    }
  });

  it("puts the first turn's empty transcript in a non-empty block", () => {
    const blocks = judgeUserBlocks(inputFor("Hi, I'm Sam."));
    expect(blocks.filter((b) => b.cache).map((b) => b.text)).toEqual(["\n(nothing said yet)"]);
  });
});

describe(`fixed transcript (${live ? `live: ${process.env.JUDGE_MODEL || "claude-haiku-5-5"}` : "canned judge"})`, () => {
  it(
    "every judged turn passes the schema and clamps, and suspicion stays in [0, 100]",
    async () => {
      const transcript: Turn[] = [];
      let claims = initialClaims();
      let suspicion = START_SUSPICION;
      const applied: number[] = [];
      let userTurns = 0;
      const streak = (bad: boolean) => {
        let n = 0;
        for (let k = applied.length - 1; k >= 0 && (bad ? applied[k] > 0 : applied[k] < 0); k--) n++;
        return n;
      };

      for (const [i, t] of fixture.turns.entries()) {
        if (t.role === "agent") {
          transcript.push({ index: i, role: "agent", text: t.text, tSec: i * 15 });
          continue;
        }
        userTurns++;
        const turn = userTurn(t.text, t.timing!, i);
        transcript.push(turn);
        const out = await judgeTurn({ profile, setup, transcript, turn, previousClaims: claims, userTurnNumber: userTurns });

        JudgeResultSchema.parse(out.result);
        expect(out.degraded, `turn #${i}: judge fell back to the neutral result`).toBe(false);
        expect(out.result.delta).toBeGreaterThanOrEqual(-15);
        expect(out.result.delta).toBeLessThanOrEqual(25);
        expect(out.result.claims_status.map((c) => c.claim)).toEqual(setup.claims);

        const { delta } = appliedDelta(out.result.delta, 60, { lastDelta: applied.at(-1) ?? null, badStreak: streak(true), goodStreak: streak(false) });
        applied.push(delta);
        suspicion = applyDelta(suspicion, delta);
        claims = out.result.claims_status;
        if (live) console.log(`#${i} judge ${out.result.delta} → applied ${delta} → ${suspicion} | ${out.result.reasons.join(" / ")}`);
      }
      expect(userTurns).toBeGreaterThan(0);
      expect(suspicion).toBeGreaterThanOrEqual(0);
      expect(suspicion).toBeLessThanOrEqual(100);
    },
    live ? 300_000 : 5_000,
  );
});
