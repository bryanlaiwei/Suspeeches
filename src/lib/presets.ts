import type { ScenarioId, Setup } from "./schemas";

/** The four character art sets in public/avatars/<art>/{happy,chill,suspicious}.png. */
export type Art = "recruiter" | "peer" | "custom-male" | "custom-female";

/** The player's own face on the call (falls back if a character already uses it). */
export function playerArt(cast: { art: Art }[]): Art {
  const used = new Set(cast.map((c) => c.art));
  return (["custom-female", "custom-male", "recruiter", "peer"] as Art[]).find((a) => !used.has(a)) ?? "custom-female";
}

/** Client-safe scenario metadata. Agent config (voice, LLM, prompt) lives in prompts/npc/*.md. */
export interface ScenarioPreset {
  id: ScenarioId;
  label: string;
  character: string;
  title: string;
  blurb: string;
  defaultGoal: string;
  /** Avatar art and card colours. */
  art: Art;
  tint: string;
  accent: string;
}

export const PRESETS: ScenarioPreset[] = [
  {
    id: "recruiter",
    label: "Recruiter screen",
    character: "Dana",
    title: "Senior technical recruiter",
    blurb: "A brisk phone screen. Dana has read a thousand padded résumés.",
    defaultGoal: "Get Dana to move you forward to the hiring-manager round.",
    art: "peer",
    tint: "#ddf4ff",
    accent: "#1cb0f6",
  },
  {
    id: "networking",
    label: "Networking mixer",
    character: "Priya",
    title: "Founder at a startup mixer",
    blurb: "Fast talker, sizing you up as a hire, partner or intro.",
    defaultGoal: "Get Priya to offer an intro to her investor.",
    art: "custom-female",
    tint: "#ffe3f3",
    accent: "#ff86d0",
  },
];

/** Group scenes: one ElevenLabs agent voices several characters (multi-voice). */
export const PARTY_PRESET: ScenarioPreset = {
  id: "party",
  label: "Startup interview (panel)",
  character: "Maya, Theo & Jordan",
  title: "Interview panel at Lumen",
  blurb: "A CTO, a CEO and a design lead interview you at once. Three people, one cover story.",
  defaultGoal: "Get an offer to join Lumen.",
  art: "peer",
  tint: "#dcf7c7",
  accent: "#58cc02",
};

export const GROUP_PRESET: ScenarioPreset = {
  id: "group",
  label: "Custom group",
  character: "Your group",
  title: "2-3 characters you write",
  blurb: "Build your own group of up to three characters.",
  defaultGoal: "Convince the whole group you are who you say you are.",
  art: "recruiter",
  tint: "#ece1ff",
  accent: "#a46cf6",
};

/** One person on stage. `label` is their multi-voice tag (empty for 1-on-1 scenes). */
export interface CastMember {
  name: string;
  title: string;
  label: string;
  /** What this character knows well enough to spot a faker (group scenes). */
  expertise: string;
  art: Art;
  tint: string;
  accent: string;
}

export const PARTY_CAST: CastMember[] = [
  {
    name: "Maya",
    title: "CTO",
    label: "Maya",
    expertise: "software engineering, system design, infrastructure, engineering teams and hiring",
    art: "peer",
    tint: "#ddf4ff",
    accent: "#1cb0f6",
  },
  {
    name: "Theo",
    title: "CEO & co-founder",
    label: "Theo",
    expertise: "business impact, revenue and growth metrics, fundraising, company culture, go-to-market",
    art: "custom-male",
    tint: "#fff1c2",
    accent: "#ff9600",
  },
  {
    name: "Jordan",
    title: "Head of design",
    label: "Jordan",
    expertise: "product and visual design, UX research, design systems, design tools, design-engineering handoff",
    art: "recruiter",
    tint: "#ece1ff",
    accent: "#a46cf6",
  },
];

const GROUP_LOOKS: Pick<CastMember, "art" | "tint" | "accent">[] = [
  { art: "custom-male", tint: "#fff1c2", accent: "#ff9600" },
  { art: "peer", tint: "#ddf4ff", accent: "#1cb0f6" },
  { art: "recruiter", tint: "#ece1ff", accent: "#a46cf6" },
];

export const isGroupScenario = (id: ScenarioId) => id === "party" || id === "group";

export const CUSTOM_PRESET: ScenarioPreset = {
  id: "custom",
  label: "Custom character",
  character: "Custom",
  title: "Your own character",
  blurb: "Write your own character and goal.",
  defaultGoal: "Convince them you are who you say you are.",
  art: "custom-male",
  tint: "#fff1c2",
  accent: "#ff9600",
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
  const { art, tint, accent } = p;
  return [{ name: custom?.name ?? p.character, title: custom ? "Custom character" : p.title, label: "", expertise: "", art, tint, accent }];
}
