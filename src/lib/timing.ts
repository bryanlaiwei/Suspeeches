import { SILENCE_FIRST_SEC } from "./scoring";
import type { DeliverySignals, Timing } from "./types";

/** Single-word and multi-word fillers. Matched case-insensitively on word boundaries. */
const FILLERS = [
  "um",
  "umm",
  "uh",
  "uhh",
  "er",
  "erm",
  "hmm",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "actually",
  "literally",
  "honestly",
];

const LONG_PAUSE_MS = 4000;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function findFillers(text: string): string[] {
  const lower = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ")} `;
  const found: string[] = [];
  for (const f of FILLERS) {
    const re = new RegExp(`(?<=\\s)${f.replace(/ /g, "\\s+")}(?=\\s)`, "g");
    const hits = lower.match(re);
    if (hits) for (let i = 0; i < hits.length; i++) found.push(f);
  }
  return found;
}

/** Derive delivery signals from transcript text + client-measured timing (no audio analysis). */
export function deliverySignals(text: string, timing: Timing): DeliverySignals {
  const words = countWords(text);
  const fillers = findFillers(text);
  const fillerRate = words ? (fillers.length / words) * 100 : 0;
  const wordsPerMinute =
    timing.speechMs && timing.speechMs > 800 ? Math.round(words / (timing.speechMs / 60000)) : null;
  return {
    words,
    fillerCount: fillers.length,
    fillerRate: Math.round(fillerRate * 10) / 10,
    fillers,
    responseLatencyMs: timing.responseLatencyMs,
    speechMs: timing.speechMs,
    wordsPerMinute,
    longPause: (timing.responseLatencyMs ?? 0) >= LONG_PAUSE_MS,
  };
}

export function describeSignals(s: DeliverySignals): string {
  const parts = [
    `words: ${s.words}`,
    `filler words: ${s.fillerCount} (${s.fillerRate} per 100 words)${s.fillers.length ? ` [${s.fillers.join(", ")}]` : ""}`,
    `response latency: ${s.responseLatencyMs == null ? "unknown" : `${(s.responseLatencyMs / 1000).toFixed(1)} s`}${
      (s.responseLatencyMs ?? 0) >= SILENCE_FIRST_SEC * 1000
        ? " (already penalised separately as silence; judge only the words, and treat the pause as a normal hesitation at most)"
        : s.longPause
          ? " (long pause)"
          : ""
    }`,
    `speaking time: ${s.speechMs == null ? "unknown" : `${(s.speechMs / 1000).toFixed(1)} s`}`,
    `pace: ${s.wordsPerMinute == null ? "unknown" : `${s.wordsPerMinute} words/min`}`,
  ];
  return parts.join("\n");
}
