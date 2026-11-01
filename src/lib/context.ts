import { presetFor } from "./presets";
import type { Profile, Setup } from "./schemas";
import type { SuspicionEvent, Turn } from "./types";

/** Text blocks shared by the judge, gap estimator, suggester and summarizer prompts. */

export function formatProfile(p: Profile): string {
  return [
    `Name: ${p.name}`,
    `Current role: ${p.role || "(not given)"}`,
    `Years of experience: ${p.yearsExperience}`,
    `Skills: ${p.skills.length ? p.skills.join(", ") : "(not given)"}`,
    `Education: ${p.education || "(not given)"}`,
    `Facts: ${p.facts.length ? p.facts.map((f) => `\n- ${f}`).join("") : "(none)"}`,
  ].join("\n");
}

export function formatClaims(claims: string[]): string {
  return claims.map((c, i) => `${i + 1}. ${c}`).join("\n");
}

export function formatScene(setup: Setup): string {
  const preset = presetFor(setup.scenarioId);
  const who =
    setup.scenarioId === "custom" && setup.custom
      ? `${setup.custom.name}: ${setup.custom.personality}${setup.custom.setting ? ` Setting: ${setup.custom.setting}` : ""}`
      : `${preset.character}, ${preset.title}. ${preset.blurb}`;
  return `Character: ${who}\nPlayer's goal: ${setup.goal}\nTime limit: ${Math.round(setup.timeLimitSec / 60)} min`;
}

export function characterName(setup: Setup): string {
  return setup.scenarioId === "custom" && setup.custom ? setup.custom.name : presetFor(setup.scenarioId).character;
}

export function formatTranscript(turns: Turn[], npcName: string, maxTurns = 40): string {
  const recent = turns.slice(-maxTurns);
  if (!recent.length) return "(nothing said yet)";
  return recent
    .map((t) => `[#${t.index} ${fmtTime(t.tSec)}] ${t.role === "user" ? "PLAYER" : npcName.toUpperCase()}: ${t.text}`)
    .join("\n");
}

export function formatJudged(events: SuspicionEvent[]): string {
  if (!events.length) return "(no judged turns)";
  return events
    .map(
      (e) =>
        `${e.kind === "silence" ? `silence penalty (turn_index ${e.turnIndex})` : `turn_index ${e.turnIndex}`} at ${fmtTime(e.tSec)}: delta ${e.delta >= 0 ? "+" : ""}${e.delta} → ${e.suspicion}. ${e.reasons.join(" / ")}`,
    )
    .join("\n");
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
