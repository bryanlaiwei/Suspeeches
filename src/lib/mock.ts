import type { DebriefRaw, JudgeRaw, SuggestRaw } from "./schemas";
import type { DeliverySignals } from "./types";

/**
 * MOCK_MODE responses. Development aid only: deterministic heuristics so the UI and the
 * pipelines can be exercised without API keys. Not a game mode.
 */

const HEDGES = /\b(i think|i guess|maybe|probably|stuff|things|whatever|not sure|kind of|sort of)\b/gi;
const SPECIFIC = /\b(\d+|percent|million|thousand|kubernetes|postgres|python|react|aws|q[1-4]|20\d\d)\b/gi;

export function mockJudge(text: string, signals: DeliverySignals, claims: string[], turnNo: number): JudgeRaw {
  const hedges = (text.match(HEDGES) ?? []).length;
  const specifics = (text.match(SPECIFIC) ?? []).length;
  let delta = 2 + hedges * 4 + signals.fillerCount * 3 - specifics * 4;
  if (signals.longPause) delta += 6;
  if (signals.words < 6) delta += 5;
  const reasons: string[] = [];
  if (hedges) reasons.push(`You hedged ${hedges} time${hedges > 1 ? "s" : ""} instead of committing.`);
  if (signals.fillerCount) reasons.push(`You used filler words: ${signals.fillers.slice(0, 3).join(", ")}.`);
  if (signals.longPause) reasons.push("You paused a long time before answering.");
  if (specifics) reasons.push("You gave concrete details, which sounded credible.");
  if (!reasons.length) reasons.push("Nothing stood out either way.");
  const tested = Math.min(claims.length, Math.ceil(turnNo / 2));
  return {
    delta,
    reasons,
    categories: {
      consistency: 7,
      specificity: Math.min(10, 4 + specifics * 2),
      plausibility: 6,
      delivery: Math.max(0, 8 - signals.fillerCount * 2 - (signals.longPause ? 3 : 0)),
    },
    claims_status: claims.map((claim, i) => ({
      claim,
      status: i < tested ? (delta > 8 ? "shaky" : "held") : "untested",
    })),
    next_probe: claims[turnNo % claims.length]
      ? `Ask for a concrete example behind: "${claims[turnNo % claims.length]}".`
      : "Ask what they are working on right now.",
  };
}

export function mockGap(claims: string[]) {
  const gap_score = Math.min(90, 25 + claims.length * 12);
  return {
    gap_score,
    rationale: "Mock estimate: more claims means more to invent and defend.",
    hardest_claims: claims.slice(0, 2),
  };
}

export function mockSuggest(): SuggestRaw {
  return {
    suggestions: [
      { claim: "I led a team of six engineers on our payments rewrite.", why: "A seniority jump with numbers to defend." },
      { claim: "I've shipped production code in Rust for three years.", why: "Easy to probe with one technical question." },
      { claim: "I spoke at a regional conference about data pipelines.", why: "Needs a talk title and a venue." },
      { claim: "I trained as a sommelier before switching careers.", why: "Bold: a whole second vocabulary." },
      { claim: "I closed a seed round for a side project last year.", why: "Investors, amounts and dates, all checkable." },
    ],
  };
}

export function mockDebrief(input: {
  outcome: "survived" | "caught";
  finalSuspicion: number;
  larpGap: number;
  claims: string[];
  spikes: { turnIndex: number; reason: string }[];
}): DebriefRaw {
  return {
    outcome: input.outcome,
    final_suspicion: input.finalSuspicion,
    headline: input.outcome === "survived" ? "Cool under pressure, mostly." : "The cover story cracked.",
    timeline: input.spikes.slice(0, 4).map((s) => ({ turn_index: s.turnIndex, reason: s.reason })),
    claims: input.claims.map((claim, i) => ({
      claim,
      verdict: i === 0 ? "held" : i === 1 ? "shaky" : "untested",
      note: "Mock verdict for development.",
    })),
    tips: [
      "Prepare one concrete number for every claim before the scene starts.",
      "When you need time, ask a question back instead of filling silence with 'um'.",
      "Keep the story small: fewer claims are easier to keep consistent.",
    ],
    larp_gap: input.larpGap,
  };
}

/** Scripted multi-voice lines (with tags, like the real group agent emits) for the mock driver. */
export function mockGroupLines(cast: { name: string; label: string }[]): { firstMessage: string; lines: string[] } {
  const t = (i: number, text: string) => {
    const c = cast[i % cast.length];
    return `<${c.label}>${text}</${c.label}>`;
  };
  return {
    firstMessage: `${t(0, `Oh hey, I'm ${cast[0].name}.`)} ${t(1, `${cast[1].name}. Who are you?`)}`,
    lines: [
      `${t(1, "Interesting. What are you working on right now?")}`,
      `${t(2, "Wait, how big was that team?")} ${t(0, "Yeah, and what was your part exactly?")}`,
      `${t(0, "Give us a concrete example.")}`,
      `${t(2, "Hm. That's not what you said a minute ago.")}`,
      `${t(1, "What would you do differently next time?")}`,
    ],
  };
}

/** Scripted NPC lines for the mock voice driver. */
export function mockNpcLines(characterName: string): { firstMessage: string; lines: string[] } {
  return {
    firstMessage: `Hi, I'm ${characterName}. Tell me a bit about yourself.`,
    lines: [
      "Interesting. What does a normal week look like for you?",
      "Can you give me a concrete example of that?",
      "How big was the team, and what was your part exactly?",
      "What was the hardest decision you made there?",
      "And what would you do differently next time?",
      "Okay. What are you looking for next?",
    ],
  };
}
