import { describe, expect, it } from "vitest";
import type { JudgeRaw } from "./schemas";
import { JudgeResultSchema } from "./schemas";
import {
  appliedDelta,
  applyDelta,
  clampDelta,
  cutShort,
  finalScore,
  moodFor,
  normalizeJudge,
  outcomeLabel,
  START_SUSPICION,
} from "./scoring";

const fresh = { lastDelta: null, badStreak: 0, goodStreak: 0 };
const claims = ["I'm a senior backend engineer", "I led our Kubernetes migration", "I'm fluent in Go"];
const raw: JudgeRaw = {
  delta: 80,
  reasons: ["You contradicted yourself."],
  categories: { consistency: 14, specificity: -2, plausibility: 3.6, delivery: 5 },
  claims_status: claims.map((claim) => ({ claim, status: "shaky" as const })),
  next_probe: "  Ask which Go version they used.  ",
  listeners: [],
};

describe("clampDelta / applyDelta", () => {
  it("clamps the judge's delta to [-15, 25] and rounds it", () => {
    expect(clampDelta(80)).toBe(25);
    expect(clampDelta(-50)).toBe(-15);
    expect(clampDelta(3.6)).toBe(4);
    expect(clampDelta(Number.NaN)).toBe(0);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("keeps suspicion in [0, 100]", () => {
    expect(applyDelta(95, 25)).toBe(100);
    expect(applyDelta(5, -15)).toBe(0);
    expect(applyDelta(START_SUSPICION, 4.4)).toBe(24);
  });
});

describe("appliedDelta", () => {
  it("scales by sensitivity alone at gap 0, and by the gap symmetrically", () => {
    expect(appliedDelta(10, 0, fresh).delta).toBe(13); // 10 × 1.25 = 12.5, rounded away from zero
    expect(appliedDelta(-10, 0, fresh).delta).toBe(-13);
    expect(appliedDelta(10, 60, fresh).delta).toBe(18); // × 1.4 × 1.25 = 17.5
    expect(appliedDelta(-10, 60, fresh).delta).toBe(-18);
  });

  it("adds +2 per previous bad answer in a row, capped at 3", () => {
    expect(appliedDelta(10, 60, { lastDelta: 14, badStreak: 2, goodStreak: 0 }).delta).toBe(22);
    const capped = appliedDelta(10, 0, { lastDelta: 5, badStreak: 9, goodStreak: 0 });
    expect(capped.delta).toBe(19); // 12.5 + 6
    expect(capped.notes).toContain("+6 bad streak");
  });

  it("subtracts 2 per previous good answer in a row", () => {
    expect(appliedDelta(-6, 60, { lastDelta: -8, badStreak: 0, goodStreak: 1 }).delta).toBe(-12);
  });

  it("does not apply a streak to a zero delta", () => {
    expect(appliedDelta(0, 60, { lastDelta: 10, badStreak: 3, goodStreak: 0 })).toEqual({ delta: 0, notes: [] });
  });

  it("clears 40% of the last spike when a good answer follows it", () => {
    // -10 at gap 60 → -17.5, minus round(25 × 0.4) = 10 → -27.5 → -28
    const r = appliedDelta(-10, 60, { lastDelta: 25, badStreak: 1, goodStreak: 0 });
    expect(r.delta).toBe(-28);
    expect(r.notes).toContain("−10 cleared up the last doubt");
  });

  it("needs both a real spike and a real good answer for redemption", () => {
    expect(appliedDelta(-3, 0, { lastDelta: 25, badStreak: 1, goodStreak: 0 }).notes).not.toContain("−10 cleared up the last doubt");
    expect(appliedDelta(-10, 0, { lastDelta: 9, badStreak: 1, goodStreak: 0 }).delta).toBe(-13);
  });

  it("caps the applied change at ±50 and says so", () => {
    const r = appliedDelta(25, 100, { lastDelta: 20, badStreak: 3, goodStreak: 0 });
    expect(r.delta).toBe(50);
    expect(r.notes).toContain("capped at +50");
  });
});

describe("finalScore", () => {
  const base = { caught: false, durationSec: 150, timeLimitSec: 300, gapMultiplier: 1, averageSuspicion: 100 };

  it("gives full survival only for running out the clock", () => {
    expect(finalScore({ ...base, endReason: "timeout" }).breakdown.survival).toBe(1000);
  });

  it("gives half for hanging up or a dropped call", () => {
    for (const endReason of ["left", "error", "npc_ended"] as const) {
      expect(finalScore({ ...base, endReason }).breakdown.survival).toBe(500);
    }
  });

  it("gives up to 250 for how long you held out when caught", () => {
    expect(finalScore({ ...base, endReason: "caught", caught: true }).breakdown.survival).toBe(125);
    expect(finalScore({ ...base, endReason: "caught", caught: true, durationSec: 999 }).breakdown.survival).toBe(250);
  });

  it("multiplies by the gap and the low-suspicion bonus", () => {
    const r = finalScore({ ...base, endReason: "timeout", gapMultiplier: 2, averageSuspicion: 30 });
    expect(r.breakdown).toEqual({ survival: 1000, gapMultiplier: 2, lowSuspicionBonus: 1.7 });
    expect(r.score).toBe(3400);
  });
});

describe("end reasons", () => {
  it("only a timeout is a survive", () => {
    expect(cutShort("timeout")).toBe(false);
    expect(["left", "error", "npc_ended"].every(cutShort)).toBe(true);
  });

  it("labels each ending", () => {
    expect(outcomeLabel(true, "caught")).toBe("CAUGHT");
    expect(outcomeLabel(false, "timeout")).toBe("SURVIVED");
    expect(outcomeLabel(false, "left")).toBe("WALKED OUT");
    expect(outcomeLabel(false, "error")).toBe("CALL DROPPED");
    expect(outcomeLabel(false, "npc_ended")).toBe("CALL DROPPED");
  });
});

describe("moodFor", () => {
  it("uses the 35 / 60 / 80 bands", () => {
    expect([0, 34, 35, 59, 60, 79, 80, 100].map(moodFor)).toEqual([
      "warm",
      "warm",
      "curious",
      "curious",
      "skeptical",
      "skeptical",
      "cold",
      "cold",
    ]);
  });
});

describe("normalizeJudge", () => {
  it("produces a schema-valid result with every number clamped", () => {
    const r = JudgeResultSchema.parse(normalizeJudge(raw, claims));
    expect(r.delta).toBe(25);
    expect(r.categories).toEqual({ consistency: 10, specificity: 0, plausibility: 4, delivery: 5 });
    expect(r.next_probe).toBe("Ask which Go version they used.");
    expect(r.listeners).toEqual([]);
  });

  it("keeps the player's claims as the source of truth for order and wording", () => {
    const r = normalizeJudge(
      {
        ...raw,
        claims_status: [
          { claim: "  i'm FLUENT in go ", status: "contradicted" },
          { claim: "something the model made up", status: "held" },
        ],
      },
      claims,
    );
    expect(r.claims_status).toEqual([
      // no match by wording: falls back to the same position
      { claim: claims[0], status: "contradicted" },
      { claim: claims[1], status: "held" },
      { claim: claims[2], status: "contradicted" },
    ]);
  });

  it("marks claims the model skipped as untested", () => {
    const r = normalizeJudge({ ...raw, claims_status: [] }, claims);
    expect(r.claims_status.map((c) => c.status)).toEqual(["untested", "untested", "untested"]);
  });

  it("fills in a reason when the model gave none and keeps at most five", () => {
    expect(normalizeJudge({ ...raw, reasons: [] }, claims).reasons).toEqual(["No specific tell this turn."]);
    expect(normalizeJudge({ ...raw, reasons: ["a", " ", "b", "c", "d", "e", "f"] }, claims).reasons).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("group scenes: every listener gets a clamped delta, falling back to the overall one", () => {
    const r = JudgeResultSchema.parse(
      normalizeJudge({ ...raw, delta: 12, listeners: [{ name: "maya", delta: 40, reason: " Wrong jargon. " }] }, claims, ["Maya", "Theo"]),
    );
    expect(r.listeners).toEqual([
      { name: "Maya", delta: 25, reason: "Wrong jargon." },
      { name: "Theo", delta: 12, reason: "" },
    ]);
  });
});
