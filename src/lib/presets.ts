import type { ScenarioId } from "./schemas";

/** Client-safe scenario metadata. Agent config (voice, LLM, prompt) lives in prompts/npc/*.md. */
export interface ScenarioPreset {
  id: ScenarioId;
  label: string;
  character: string;
  title: string;
  blurb: string;
  defaultGoal: string;
  /** Avatar palette. */
  skin: string;
  hair: string;
  accent: string;
  hairStyle: "short" | "long" | "bun" | "curly";
}

export const PRESETS: ScenarioPreset[] = [
  {
    id: "recruiter",
    label: "Recruiter screen",
    character: "Dana",
    title: "Senior technical recruiter",
    blurb: "A brisk phone screen. Dana has read a thousand padded résumés.",
    defaultGoal: "Get Dana to move you forward to the hiring-manager round.",
    skin: "#f1c7a5",
    hair: "#3b2a20",
    accent: "#7c5cff",
    hairStyle: "long",
  },
  {
    id: "networking",
    label: "Networking mixer",
    character: "Priya",
    title: "Founder at a startup mixer",
    blurb: "Fast talker, sizing you up as a hire, partner or intro.",
    defaultGoal: "Get Priya to offer an intro to her investor.",
    skin: "#a8714f",
    hair: "#24140e",
    accent: "#19c39c",
    hairStyle: "bun",
  },
];

export const CUSTOM_PRESET: ScenarioPreset = {
  id: "custom",
  label: "Custom character",
  character: "Custom",
  title: "Your own character",
  blurb: "Write your own character and goal.",
  defaultGoal: "Convince them you are who you say you are.",
  skin: "#e8b796",
  hair: "#5a3b2b",
  accent: "#e64980",
  hairStyle: "curly",
};

/**
 * Premade ElevenLabs voices offered for custom characters. IDs are ElevenLabs default voices;
 * check they are in your account's voice library.
 */
export const VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George (warm, British)" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (calm, American)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh (young, American)" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte (bright, Swedish-English)" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie (casual, Australian)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (soft, American)" },
];

export function presetFor(id: ScenarioId): ScenarioPreset {
  return PRESETS.find((p) => p.id === id) ?? CUSTOM_PRESET;
}
