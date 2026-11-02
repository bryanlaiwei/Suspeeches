import type { Setup } from "./schemas";
import { isGroupScenario, SCENARIO_IDS, SCENARIOS, type CastMember, type ScenarioDef, type ScenarioId } from "./scenarios";

/**
 * Views of the scenario registry (scenarios.ts) for the UI and prompts, plus the cast of a given
 * setup. Agent config (voice, LLM, first message) lives in prompts/npc/<id>.md.
 */
export { isGroupScenario, type CastMember };

export interface ScenarioPreset extends ScenarioDef {
  id: ScenarioId;
}

/** Every scenario, in the order the setup screen shows them. */
export const ALL_SCENES: ScenarioPreset[] = SCENARIO_IDS.map((id) => ({ id, ...SCENARIOS[id] }));

/** The fixed one-character scenes (Dana, Priya...). */
export const PRESETS: ScenarioPreset[] = ALL_SCENES.filter((s) => s.kind === "character");

/** The startup interview panel. */
export const PARTY_CAST: CastMember[] = SCENARIOS.party.cast;

export function presetFor(id: ScenarioId): ScenarioPreset {
  return ALL_SCENES.find((p) => p.id === id)!;
}

type Look = Pick<CastMember, "avatar" | "accent">;

/** Faces for player-written characters, matched to the voice. Group voices are distinct, so 3 per voice type is enough. */
const LOOKS: Record<"f" | "m", Look[]> = {
  f: [
    { avatar: "custom-female", accent: "#58cc02" },
    { avatar: "group-f1", accent: "#ff5a4e" },
    { avatar: "group-f2", accent: "#ffc800" },
  ],
  m: [
    { avatar: "custom-male", accent: "#ff9600" },
    { avatar: "group-m1", accent: "#58cc02" },
    { avatar: "group-m2", accent: "#3d5afe" },
  ],
};

/**
 * Premade ElevenLabs voices offered for custom characters. IDs are ElevenLabs default voices;
 * check they are in your account's voice library.
 */
export const VOICES: { id: string; label: string; look: "f" | "m" }[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George (warm, British)", look: "m" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (calm, American)", look: "f" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh (young, American)", look: "m" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte (bright, Swedish-English)", look: "f" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie (casual, Australian)", look: "m" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (soft, American)", look: "f" },
];

const lookOf = (voiceId: string): "f" | "m" => VOICES.find((v) => v.id === voiceId)?.look ?? "f";

/** Multi-voice tag for a premade voice: its first word, e.g. "George". */
export function voiceLabel(voiceId: string): string {
  return (VOICES.find((v) => v.id === voiceId)?.label ?? "Voice").split(" ")[0];
}

/** Everyone the player is talking to, in stage order. */
export function castFor(setup: Pick<Setup, "scenarioId" | "custom" | "group">): CastMember[] {
  const p = presetFor(setup.scenarioId);
  if (p.kind === "panel" && p.cast) return p.cast;
  if (p.kind === "group" && setup.group) {
    const used = { f: 0, m: 0 };
    return setup.group.characters.map((c) => {
      const kind = lookOf(c.voiceId);
      return {
        name: c.name,
        title: c.personality.split(/[.,]/)[0].slice(0, 40),
        label: voiceLabel(c.voiceId),
        expertise: c.expertise || "nothing in particular (judges mostly on consistency and confidence)",
        ...LOOKS[kind][used[kind]++ % LOOKS[kind].length],
      };
    });
  }
  const custom = p.kind === "custom" ? setup.custom : undefined;
  const { avatar, accent } = custom ? LOOKS[lookOf(custom.voiceId)][0] : p;
  return [{ name: custom?.name ?? p.character, title: custom ? "Custom character" : p.title, label: "", expertise: "", avatar, accent }];
}
