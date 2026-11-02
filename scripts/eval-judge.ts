/**
 * Runs the judge regression set (src/lib/__fixtures__/judge-evals.json) against the real judge and
 * checks every case lands in its expected delta range. Run it after changing prompts/judge.md or
 * JUDGE_MODEL, and compare against the last run.
 *
 *   npm run eval:judge             # one run per case
 *   npm run eval:judge -- --runs 3 # median of three (the judge isn't deterministic)
 *
 * Prints the judge prompt hash and model with the results, so runs can be told apart.
 */
import evals from "../src/lib/__fixtures__/judge-evals.json";
import fixture from "../src/lib/__fixtures__/transcript.json";
import { env, llmMock } from "../src/lib/env";
import { judgeTurn } from "../src/lib/judge";
import { promptHash } from "../src/lib/prompts";
import { ProfileSchema, SetupSchema } from "../src/lib/schemas";
import { deliverySignals } from "../src/lib/timing";
import type { ClaimState, Turn } from "../src/lib/types";

type Case = (typeof evals.cases)[number] & { expect: { min?: number; max?: number } };

const profile = ProfileSchema.parse(fixture.profile);
const setup = SetupSchema.parse(fixture.setup);
const runsArg = process.argv.indexOf("--runs");
const runs = runsArg > 0 ? Math.max(1, Number(process.argv[runsArg + 1]) || 1) : 1;

async function judgeCase(c: Case): Promise<{ delta: number; degraded: boolean; reason: string }> {
  const transcript: Turn[] = c.turns.map((t, i) => ({ index: i, role: t.role as Turn["role"], text: t.text, tSec: i * 12 }));
  const last = transcript.at(-1)!;
  if (last.role !== "user") throw new Error(`${c.name}: the last turn must be the player's`);
  const timing = { responseLatencyMs: 900, speechMs: Math.max(1000, last.text.split(/\s+/).length * 380), tSec: last.tSec };
  const turn = { ...last, role: "user" as const, signals: deliverySignals(last.text, timing) };
  const previousClaims: ClaimState[] = setup.claims.map((claim) => ({ claim, status: "untested" }));
  const userTurnNumber = transcript.filter((t) => t.role === "user").length;
  const out = await judgeTurn({ profile, setup, transcript, turn, previousClaims, userTurnNumber });
  return { delta: out.result.delta, degraded: out.degraded, reason: out.result.reasons[0] ?? "" };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const range = (e: Case["expect"]) => `${e.min ?? "-15"}..${e.max ?? "25"}`;

async function main() {
  if (llmMock()) {
    console.error("eval:judge needs the real judge: set ANTHROPIC_API_KEY (and not MOCK_MODE).");
    process.exit(1);
  }
  console.log(`judge ${env.judgeModel} · prompt ${promptHash("judge")} · ${runs} run(s) per case\n`);
  let failed = 0;
  for (const c of evals.cases as Case[]) {
    const results = [];
    for (let i = 0; i < runs; i++) results.push(await judgeCase(c));
    const delta = median(results.map((r) => r.delta));
    const ok = !results.some((r) => r.degraded) && delta >= (c.expect.min ?? -15) && delta <= (c.expect.max ?? 25);
    if (!ok) failed++;
    const all = runs > 1 ? ` [${results.map((r) => r.delta).join(", ")}]` : "";
    console.log(`${ok ? "✓" : "✗"} ${String(delta).padStart(3)} (want ${range(c.expect)})${all}  ${c.name}`);
    if (!ok) console.log(`      ${results.some((r) => r.degraded) ? "judge call failed" : results[0].reason}`);
  }
  console.log(`\n${evals.cases.length - failed}/${evals.cases.length} in range`);
  process.exit(failed ? 1 : 0);
}

void main();
