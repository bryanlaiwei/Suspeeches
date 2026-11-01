import type { ScenarioId, Setup } from "./schemas";

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

/** Group scenes: one ElevenLabs agent voices several characters (multi-voice). */
export const PARTY_PRESET: ScenarioPreset = {
  id: "party",
  label: "Launch party (group)",
  character: "Maya, Theo & Jordan",
  title: "Three guests at a startup launch party",
  blurb: "A CTO, an investor and a nosy designer, all sizing you up at once.",
  defaultGoal: "Get the group to invite you to the founders' after-party.",
  skin: "#f1c7a5",
  hair: "#1d1410",
  accent: "#f59f00",
  hairStyle: "bun",
};

export const GROUP_PRESET: ScenarioPreset = {
  id: "group",
  label: "Custom group",
  character: "Your group",
  title: "2-3 characters you write",
  blurb: "Build your own group of up to three characters.",
  defaultGoal: "Convince the whole group you are who you say you are.",
  skin: "#c98e63",
  hair: "#151515",
  accent: "#4dabf7",
  hairStyle: "curly",
};

/** One person on stage. `label` is their multi-voice tag (empty for 1-on-1 scenes). */
export interface CastMember {
  name: string;
  title: string;
  label: string;
  /** What this character knows well enough to spot a faker (group scenes). */
  expertise: string;
  skin: string;
  hair: string;
  accent: string;
  hairStyle: ScenarioPreset["hairStyle"];
}

export const PARTY_CAST: CastMember[] = [
  { name: "Maya", title: "CTO, hosting the party", label: "Maya", expertise: "software engineering, system design, infrastructure, engineering teams and hiring", skin: "#f1c7a5", hair: "#1d1410", accent: "#f59f00", hairStyle: "bun" },
  { name: "Theo", title: "Seed investor", label: "Theo", expertise: "startup investing, fundraising, valuations, revenue and growth metrics, go-to-market", skin: "#e8b796", hair: "#8a6a4a", accent: "#7c5cff", hairStyle: "short" },
  { name: "Jordan", title: "Product designer", label: "Jordan", expertise: "product and visual design, UX research, branding, design tools, creative agencies", skin: "#8d5a3b", hair: "#151515", accent: "#e64980", hairStyle: "curly" },
];

const GROUP_LOOKS: Pick<CastMember, "skin" | "hair" | "accent" | "hairStyle">[] = [
  { skin: "#f1c7a5", hair: "#3b2a20", accent: "#4dabf7", hairStyle: "long" },
  { skin: "#c98e63", hair: "#151515", accent: "#ff8a3d", hairStyle: "short" },
  { skin: "#a8714f", hair: "#24140e", accent: "#19c39c", hairStyle: "curly" },
];

export const isGroupScenario = (id: ScenarioId) => id === "party" || id === "group";

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

/** Multi-voice tag for a premade voice: its first word, e.g. "George". */
export function voiceLabel(voiceId: string): string {
  return (VOICES.find((v) => v.id === voiceId)?.label ?? "Voice").split(" ")[0];
}

export function presetFor(id: ScenarioId): ScenarioPreset {
  if (id === "party") return PARTY_PRESET;
  if (id === "group") return GROUP_PRESET;
  return PRESETS.find((p) => p.id === id) ?? CUSTOM_PRESET;
}

/** Everyone the player is talking to, in stage order. */
export function castFor(setup: Pick<Setup, "scenarioId" | "custom" | "group">): CastMember[] {
  if (setup.scenarioId === "party") return PARTY_CAST;
  if (setup.scenarioId === "group" && setup.group) {
    return setup.group.characters.map((c, i) => ({
      name: c.name,
      title: c.personality.split(/[.,]/)[0].slice(0, 40),
      label: voiceLabel(c.voiceId),
      expertise: c.expertise || "nothing in particular (judges mostly on consistency and confidence)",
      ...GROUP_LOOKS[i % GROUP_LOOKS.length],
    }));
  }
  const p = presetFor(setup.scenarioId);
  const custom = setup.scenarioId === "custom" ? setup.custom : undefined;
  const { skin, hair, accent, hairStyle } = p;
  return [
    { name: custom?.name ?? p.character, title: custom ? "Custom character" : p.title, label: "", expertise: "", skin, hair, accent, hairStyle },
  ];
}
