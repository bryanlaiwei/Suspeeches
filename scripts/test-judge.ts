/**
 * Runs a fixed transcript through the judge and checks the output contract.
 *
 *   npm run test:judge            # real JUDGE_MODEL if ANTHROPIC_API_KEY is set, mock otherwise
 *   MOCK_MODE=1 npm run test:judge
 *
 * Checks: zod schema on every result, delta clamp [-15, 25], suspicion stays in [0, 100],
 * claims_status mirrors the claims, retry-once on invalid output, neutral fallback after two failures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { judgeTurn } from "../src/lib/judge";
import { structuredCall, type RawCaller } from "../src/lib/llm";
import { JudgeRawSchema, JudgeResultSchema, ProfileSchema, SetupSchema } from "../src/lib/schemas";
import { applyDelta, clampDelta, normalizeJudge, START_SUSPICION } from "../src/lib/scoring";
import { deliverySignals } from "../src/lib/timing";
import type { ClaimState, Turn } from "../src/lib/types";

const fixture = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/fixtures/transcript.json"), "utf8"));
const profile = ProfileSchema.parse(fixture.profile);
const setup = SetupSchema.parse(fixture.setup);

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n    ${err instanceof Error ? err.message : err}`);
  }
}

const validRaw = {
  delta: 80,
  reasons: ["You contradicted yourself."],
  categories: { consistency: 14, specificity: -2, plausibility: 3.6, delivery: 5 },
  claims_status: setup.claims.map((claim) => ({ claim, status: "shaky" as const })),
  next_probe: "Ask which Go version they used.",
};

async function unitChecks() {
  console.log("\nClamp + normalization");
  await check("delta clamps to [-15, 25]", () => {
    assert.equal(clampDelta(80), 25);
    assert.equal(clampDelta(-50), -15);
    assert.equal(clampDelta(3.6), 4);
    assert.equal(clampDelta(Number.NaN), 0);
  });
  await check("normalizeJudge produces a schema-valid result", () => {
    const r = JudgeResultSchema.parse(normalizeJudge(validRaw, setup.claims));
    assert.equal(r.delta, 25);
    assert.deepEqual(r.categories, { consistency: 10, specificity: 0, plausibility: 4, delivery: 5 });
    assert.equal(r.claims_status.length, setup.claims.length);
  });
  await check("suspicion never leaves [0, 100]", () => {
    assert.equal(applyDelta(95, 25), 100);
    assert.equal(applyDelta(5, -15), 0);
  });

  console.log("\nRetry behaviour");
  await check("retries once on invalid JSON, then succeeds", async () => {
    let calls = 0;
    const flaky: RawCaller = async () => (++calls === 1 ? "not json {" : JSON.stringify(validRaw));
    const { attempts } = await structuredCall(
      { label: "test", model: "x", system: "", user: "", schema: JudgeRawSchema, maxTokens: 10, effort: "low" },
      flaky,
    );
    assert.equal(attempts, 2);
    assert.equal(calls, 2);
  });
  await check("schema-invalid twice → neutral degraded result, no throw", async () => {
    let calls = 0;
    const broken: RawCaller = async () => {
      calls++;
      return JSON.stringify({ delta: "lots", reasons: [] });
    };
    const turn = mkUserTurn("I did it.", { responseLatencyMs: 500, speechMs: 1000 }, 1);
    const out = await judgeTurn(
      { profile, setup, transcript: [turn], turn, previousClaims: initialClaims(), userTurnNumber: 1 },
      broken,
    );
    assert.equal(calls, 2);
    assert.equal(out.degraded, true);
    assert.equal(out.result.delta, 0);
    JudgeResultSchema.parse(out.result);
  });
}

function initialClaims(): ClaimState[] {
  return setup.claims.map((claim) => ({ claim, status: "untested" }));
}

function mkUserTurn(text: string, timing: { responseLatencyMs: number; speechMs: number }, index: number) {
  const t = { responseLatencyMs: timing.responseLatencyMs, speechMs: timing.speechMs, tSec: index * 15 };
  return { index, role: "user" as const, text, tSec: t.tSec, signals: deliverySignals(text, t) };
}

async function transcriptRun() {
  const live = !!process.env.ANTHROPIC_API_KEY && process.env.MOCK_MODE !== "1";
  console.log(`\nFixed transcript (${live ? `live: ${process.env.JUDGE_MODEL || "claude-haiku-5-5"}` : "mock judge"})`);
  const transcript: Turn[] = [];
  let claims = initialClaims();
  let suspicion = START_SUSPICION;
  let userTurns = 0;

  for (const [i, t] of (fixture.turns as { role: "user" | "agent"; text: string; timing?: { responseLatencyMs: number; speechMs: number } }[]).entries()) {
    if (t.role === "agent") {
      transcript.push({ index: i, role: "agent", text: t.text, tSec: i * 15 });
      continue;
    }
    userTurns++;
    const turn = mkUserTurn(t.text, t.timing!, i);
    transcript.push(turn);
    const started = Date.now();
    const out = await judgeTurn({ profile, setup, transcript, turn, previousClaims: claims, userTurnNumber: userTurns });
    const ms = Date.now() - started;
    await check(`turn #${i} passes schema and clamp (${ms} ms)`, () => {
      JudgeResultSchema.parse(out.result);
      assert.ok(out.result.delta >= -15 && out.result.delta <= 25, `delta ${out.result.delta} out of range`);
      assert.deepEqual(
        out.result.claims_status.map((c) => c.claim),
        setup.claims,
        "claims_status must mirror the claims",
      );
      assert.equal(out.degraded, false, "judge fell back to the neutral result");
    });
    suspicion = applyDelta(suspicion, out.result.delta);
    claims = out.result.claims_status;
    console.log(
      `    "${t.text.slice(0, 60)}${t.text.length > 60 ? "…" : ""}"\n    delta ${out.result.delta >= 0 ? "+" : ""}${out.result.delta} → suspicion ${suspicion} | ${out.result.reasons.join(" / ")}\n    next_probe: ${out.result.next_probe}`,
    );
  }
  await check("suspicion stayed in [0, 100]", () => assert.ok(suspicion >= 0 && suspicion <= 100));
}

async function main() {
  await unitChecks();
  await transcriptRun();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll judge checks passed");
  process.exit(failures ? 1 : 0);
}

void main();
