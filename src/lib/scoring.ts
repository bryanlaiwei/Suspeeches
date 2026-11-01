import type { JudgeRaw } from "./schemas";
import type { EndReason, JudgeResult } from "./types";

export const START_SUSPICION = 15;
export const CAUGHT_AT = 100;
export const DELTA_MIN = -15;
export const DELTA_MAX = 25;
/** A judged turn at or above this delta plays the spike sound and gets a big marker. */
export const SPIKE_DELTA = 10;

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function clampDelta(delta: number): number {
  if (!Number.isFinite(delta)) return 0;
  return clamp(Math.round(delta), DELTA_MIN, DELTA_MAX);
}

export function applyDelta(suspicion: number, delta: number): number {
  return clamp(suspicion + clampDelta(delta), 0, CAUGHT_AT);
}

/** Coerce raw model output into the strict judge contract (clamps every number). */
export function normalizeJudge(raw: JudgeRaw, claims: string[]): JudgeResult {
  const c = (n: number) => clamp(Math.round(Number.isFinite(n) ? n : 5), 0, 10);
  const byClaim = new Map(raw.claims_status.map((s) => [s.claim.trim().toLowerCase(), s.status]));
  return {
    delta: clampDelta(raw.delta),
    reasons: (raw.reasons.length ? raw.reasons : ["No specific tell this turn."])
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 5),
    categories: {
      consistency: c(raw.categories.consistency),
      specificity: c(raw.categories.specificity),
      plausibility: c(raw.categories.plausibility),
      delivery: c(raw.categories.delivery),
    },
    // Keep the player's claims as the source of truth for order and wording.
    claims_status: claims.map((claim, i) => ({
      claim,
      status: byClaim.get(claim.trim().toLowerCase()) ?? raw.claims_status[i]?.status ?? "untested",
    })),
    next_probe: raw.next_probe.trim(),
  };
}

/** 0..100 gap score → 1.0..3.0 difficulty multiplier. */
export function gapMultiplier(gapScore: number): number {
  return Math.round((1 + clamp(gapScore, 0, 100) / 50) * 100) / 100;
}

export function finalScore(opts: {
  endReason: EndReason;
  caught: boolean;
  durationSec: number;
  timeLimitSec: number;
  gapMultiplier: number;
  averageSuspicion: number;
}) {
  let survival: number;
  if (opts.caught) {
    // Partial credit for how long you held out.
    survival = Math.round(250 * clamp(opts.durationSec / opts.timeLimitSec, 0, 1));
  } else if (opts.endReason === "left") {
    survival = 500;
  } else {
    survival = 1000;
  }
  const lowSuspicionBonus = Math.round((1 + (100 - clamp(opts.averageSuspicion, 0, 100)) / 100) * 100) / 100;
  const score = Math.round(survival * opts.gapMultiplier * lowSuspicionBonus);
  return { score, breakdown: { survival, gapMultiplier: opts.gapMultiplier, lowSuspicionBonus } };
}
