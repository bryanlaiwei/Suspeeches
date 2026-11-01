import { characterName, formatClaims, formatJudged, formatProfile, formatScene, formatTranscript } from "./context";
import { env, llmMock } from "./env";
import { structuredCall } from "./llm";
import { mockDebrief } from "./mock";
import { render } from "./prompts";
import { DebriefRawSchema, type DebriefRaw } from "./schemas";
import { CALL_MOODS, finalScore } from "./scoring";
import type { Session } from "./sessions";
import type { Debrief } from "./types";

/** Run the summarizer once and merge its prose with the authoritative numbers from the session. */
export async function buildDebrief(s: Session): Promise<Debrief> {
  const outcome = s.status === "caught" ? "caught" : "survived";
  const endReason = s.endReason ?? "left";
  const durationSec = s.durationSec ?? 0;
  const averageSuspicion = average(s.events.map((e) => e.suspicion), s.suspicion);
  const topSpikes = [...s.events].sort((a, b) => b.delta - a.delta).slice(0, 4);

  let raw: DebriefRaw;
  if (llmMock()) {
    raw = mockDebrief({
      outcome,
      finalSuspicion: s.suspicion,
      larpGap: s.gap.gapScore,
      claims: s.setup.claims,
      spikes: topSpikes.map((e) => ({ turnIndex: e.turnIndex, reason: e.reasons[0] ?? "" })),
    });
  } else {
    try {
      raw = (
        await structuredCall({
          label: "summarizer",
          model: env.summaryModel,
          system: render("summarizer.v1", {
            real_profile: formatProfile(s.profile),
            alias: s.setup.alias,
            claims: formatClaims(s.setup.claims),
            scene: formatScene(s.setup),
            outcome,
            end_reason: endReason,
            final_suspicion: s.suspicion,
            by_character: s.suspicionBy
              ? `\nEach character's final suspicion: ${Object.entries(s.suspicionBy)
                  .map(([n, v]) => `${n} ${v}`)
                  .join(", ")}${s.caughtBy ? `. ${s.caughtBy} caught them.` : ""}`
              : "",
            larp_gap: s.gap.gapScore,
            judged_turns: formatJudged(s.events),
            transcript: formatTranscript(s.transcript, characterName(s.setup), 200),
          }),
          user: "Write the debrief.",
          schema: DebriefRawSchema,
          maxTokens: 8000,
          effort: "medium",
        })
      ).data;
    } catch (err) {
      console.error("[summarizer] failed, using judge data only:", err instanceof Error ? err.message : err);
      raw = {
        outcome,
        final_suspicion: s.suspicion,
        headline: outcome === "survived" ? "You made it out." : "Busted.",
        timeline: topSpikes.map((e) => ({ turn_index: e.turnIndex, reason: e.reasons[0] ?? "" })),
        claims: s.claims.map((c) => ({
          claim: c.claim,
          verdict: c.status === "contradicted" ? "blown" : c.status,
          note: "From the live judge.",
        })),
        tips: [
          "Prepare one concrete detail for every claim.",
          "Answer the question that was asked, then stop.",
          "Buy time with a question back instead of filler words.",
        ],
        larp_gap: s.gap.gapScore,
      };
    }
  }

  const byTurn = new Map(s.events.map((e) => [e.turnIndex, e]));
  const spikes = raw.timeline
    .map((t) => {
      const e = byTurn.get(Math.round(t.turn_index));
      return e ? { turnIndex: e.turnIndex, tSec: e.tSec, delta: e.delta, suspicion: e.suspicion, reason: t.reason } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const claimNotes = new Map(raw.claims.map((c) => [c.claim.trim().toLowerCase(), c]));
  const { score, larpScore, breakdown } = finalScore({
    endReason,
    caught: outcome === "caught",
    durationSec,
    timeLimitSec: s.setup.timeLimitSec,
    gapMultiplier: s.gap.multiplier,
    averageSuspicion,
    moodMultiplier: CALL_MOODS[s.setup.mood].scoreMultiplier,
  });

  return {
    outcome,
    endReason,
    finalSuspicion: s.suspicion,
    ...(s.suspicionBy ? { finalByCharacter: { ...s.suspicionBy } } : {}),
    ...(s.caughtBy ? { caughtBy: s.caughtBy } : {}),
    averageSuspicion: Math.round(averageSuspicion),
    headline: raw.headline,
    spikes,
    claims: s.setup.claims.map((claim, i) => {
      const c = claimNotes.get(claim.trim().toLowerCase()) ?? raw.claims[i];
      return { claim, verdict: c?.verdict ?? "untested", note: c?.note ?? "" };
    }),
    tips: raw.tips.slice(0, 3),
    larpGap: s.gap.gapScore,
    gapMultiplier: s.gap.multiplier,
    score,
    larpScore,
    scoreBreakdown: breakdown,
    durationSec,
  };
}

function average(values: number[], fallback: number): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : fallback;
}
