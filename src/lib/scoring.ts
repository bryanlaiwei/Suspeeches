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
export const APPLIED_MIN = -50;
export const APPLIED_MAX = 50;
/** How sensitive the characters are: scales every judged change, up and down alike. */
export const SENSITIVITY = 1.25;
/** ±this per consecutive turn in the same direction (bad answers in a row, or good ones), max 3. */
export const STREAK_STEP = 2;
/** A good answer right after a spike clears up this share of that spike on top of its own credit. */
export const REDEMPTION_SHARE = 0.4;
/** What counts as a spike (applied) and a good answer (judge delta) for redemption. */
export const REDEMPTION_SPIKE = 10;
export const REDEMPTION_GOOD = -4;

export interface ScoreHistory {
  /** Applied delta of the previous judged event, if any. */
  lastDelta: number | null;
  /** Consecutive previous events that raised (positive) or lowered (negative) suspicion. */
  badStreak: number;
  goodStreak: number;
}

/**
 * Turn the judge's delta (-15..25) into the change actually applied, symmetric for good and bad play:
 * 1. The larp gap scales both ways (×1.0 at gap 0, ×1.67 at gap 100): a bigger lie is more damning
 *    when it slips and more impressive when it holds. SENSITIVITY scales on top, both ways.
 * 2. Streaks: each previous bad answer in a row adds +2, each good one in a row adds -2 (max 3).
 * 3. Redemption: a good answer straight after a spike also clears 40% of that spike.
 */
export function appliedDelta(judgeDelta: number, gapScore: number, h: ScoreHistory): { delta: number; notes: string[] } {
  const d = clampDelta(judgeDelta);
  const gapFactor = 1 + clamp(gapScore, 0, 100) / 150;
  const notes: string[] = [];
  let out = d * gapFactor * SENSITIVITY;
  if (d !== 0) notes.push(gapFactor > 1.05 ? `×${(gapFactor * SENSITIVITY).toFixed(2)} larp gap and sensitivity` : `×${SENSITIVITY} sensitivity`);

  if (d > 0 && h.badStreak > 0) {
    const extra = STREAK_STEP * Math.min(h.badStreak, 3);
    out += extra;
    notes.push(`+${extra} bad streak`);
  } else if (d < 0 && h.goodStreak > 0) {
    const extra = STREAK_STEP * Math.min(h.goodStreak, 3);
    out -= extra;
    notes.push(`−${extra} good streak`);
  }

  if (d <= REDEMPTION_GOOD && h.lastDelta !== null && h.lastDelta >= REDEMPTION_SPIKE) {
    const back = Math.round(h.lastDelta * REDEMPTION_SHARE);
    out -= back;
    notes.push(`−${back} cleared up the last doubt`);
  }

  // Round half away from zero so good and bad answers round the same way.
  const rounded = Math.sign(out) * Math.round(Math.abs(out));
  const delta = clamp(rounded, APPLIED_MIN, APPLIED_MAX);
  if (delta !== rounded) notes.push(`capped at ${delta > 0 ? "+" : ""}${delta}`);
  return { delta, notes };
}

/**
 * Coerce raw model output into the strict judge contract (clamps every number).
 * `listenerNames` (group scenes) are the characters who must each get a delta, in stage order.
 */
export function normalizeJudge(raw: JudgeRaw, claims: string[], listenerNames: string[] = []): JudgeResult {
  const byListener = new Map(raw.listeners.map((l) => [l.name.trim().toLowerCase(), l]));
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
    listeners: listenerNames.map((name) => {
      const l = byListener.get(name.toLowerCase());
      return { name, delta: clampDelta(l ? l.delta : raw.delta), reason: l?.reason.trim() || "" };
    }),
  };
}

/** 0..100 gap score → 1.0..3.0 difficulty multiplier. */
export function gapMultiplier(gapScore: number): number {
  return Math.round((1 + clamp(gapScore, 0, 100) / 50) * 100) / 100;
}

/** A dropped call: the connection failed or the agent hung up on its side (agents have no hang-up tool). */
export function droppedCall(endReason: string | null | undefined): boolean {
  return endReason === "error" || endReason === "npc_ended";
}

/** Only running out the clock is a survive. Hanging up or a dropped call cuts the scene short. */
export function cutShort(endReason: string | null | undefined): boolean {
  return endReason === "left" || droppedCall(endReason);
}

/** Headline result for the debrief and game history. */
export function outcomeLabel(caught: boolean, endReason: string | null | undefined): string {
  if (caught) return "CAUGHT";
  if (endReason === "left") return "WALKED OUT";
  if (droppedCall(endReason)) return "CALL DROPPED";
  return "SURVIVED";
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
  } else if (cutShort(opts.endReason)) {
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
