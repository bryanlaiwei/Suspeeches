import type { JudgeRaw } from "./schemas";
import type { EndReason, JudgeResult } from "./types";

export const START_SUSPICION = 20;
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
  return clamp(suspicion + Math.round(delta), 0, CAUGHT_AT);
}

/* ---------- difficulty ---------- */

/** Bounds on the suspicion change actually applied for one judged turn. */
export const APPLIED_MIN = -12;
export const APPLIED_MAX = 30;
/** Trust rebuilds slower than doubt: good answers count for this fraction of the judge's delta. */
export const TRUST_RATE = 0.85;
/** Extra suspicion per consecutive suspicious turn (capped at 3 in a row). */
export const STREAK_BONUS = 2;

/**
 * Turn the judge's delta (-15..25) into the change actually applied. Doubt is amplified by the
 * larp gap (×1.0 at gap 0, ×1.67 at gap 100) and by a streak of suspicious turns; trust is damped.
 */
export function appliedDelta(judgeDelta: number, gapScore: number, streak: number): number {
  const d = clampDelta(judgeDelta);
  const out =
    d > 0
      ? d * (1 + clamp(gapScore, 0, 100) / 150) + STREAK_BONUS * Math.min(Math.max(streak, 0), 3)
      : d * TRUST_RATE;
  return clamp(Math.round(out), APPLIED_MIN, APPLIED_MAX);
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

/* ---------- silence ---------- */

/** Seconds of silence on the player's turn before the first penalty. */
export const SILENCE_FIRST_SEC = 8;
/** Further penalties while the silence continues, every this many seconds. */
export const SILENCE_REPEAT_SEC = 6;
/** Suspicion added per silence penalty (first, then each repeat). */
export const SILENCE_PENALTY = [6, 8, 10] as const;

export function silencePenalty(strikeInThisSilence: number): number {
  return SILENCE_PENALTY[Math.min(strikeInThisSilence, SILENCE_PENALTY.length - 1)];
}

/* ---------- NPC mood ---------- */

export type Mood = "warm" | "curious" | "skeptical" | "cold";

/** The NPC's tone follows suspicion in bands. */
export function moodFor(suspicion: number): Mood {
  if (suspicion < 35) return "warm";
  if (suspicion < 60) return "curious";
  if (suspicion < 80) return "skeptical";
  return "cold";
}
