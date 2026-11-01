import type { ScenarioId, Setup } from "./schemas";

/** The four character art sets in public/avatars/<art>/{happy,chill,suspicious}.png. */
export type Art = "recruiter" | "peer" | "custom-male" | "custom-female";
export const ARTS: { id: Art; label: string }[] = [
  { id: "custom-male", label: "Guy in orange" },
  { id: "custom-female", label: "Woman in green" },
  { id: "recruiter", label: "Curly with glasses" },
  { id: "peer", label: "Long hair, blue blazer" },
];
/** The player's own face. */
export const PLAYER_ART: Art = "custom-female";

/** Client-safe scenario metadata. Agent config (voice, LLM, prompt) lives in prompts/npc/*.md. */
export interface ScenarioPreset {
  id: ScenarioId;
  label: string;
  /** Badge on the scenario card. */
  tag: "EASY" | "MEDIUM" | "HARD" | "CUSTOM";
  character: string;
  title: string;
  /** The call's name on Home ("Screening call with Sam"). */
  callName: string;
  blurb: string;
  defaultGoal: string;
  art: Art;
  /** Card / circle background. */
  tint: string;
  accent: string;
}

export const PRESETS: ScenarioPreset[] = [
  {
    id: "recruiter",
    label: "Screening call",
    tag: "MEDIUM",
    character: "Sam",
    title: "Senior recruiter · Northwind Labs",
    callName: "Screening call with Sam",
    blurb: "Recruiter. Polite, thorough, remembers everything.",
    defaultGoal: "Get Sam to move you forward to the hiring-manager round.",
    art: "recruiter",
    tint: "#ece1ff",
    accent: "#a46cf6",
  },
  {
    id: "networking",
    label: "Coffee chat",
    tag: "EASY",
    character: "Dana",
    title: "Industry peer · Brightlane",
    callName: "Coffee chat with Dana",
    blurb: "Industry peer who wants to connect. Friendly, until you get vague.",
    defaultGoal: "Get Dana to refer you for a role on her team.",
    art: "peer",
    tint: "#ddf4ff",
    accent: "#1cb0f6",
  },
];

/** Group scenes: one ElevenLabs agent voices several characters (multi-voice). */
export const PARTY_PRESET: ScenarioPreset = {
  id: "party",
  label: "Startup panel",
  tag: "HARD",
  character: "Maya, Theo & Jordan",
  title: "Interview panel · Lumen",
  callName: "Panel interview at Lumen",
  blurb: "A CTO, a CEO and a design lead. Three people, one cover story.",
  defaultGoal: "Get an offer to join Lumen.",
  art: "peer",
  tint: "#dcf7c7",
  accent: "#58cc02",
};

export const CUSTOM_PRESET: ScenarioPreset = {
  id: "custom",
  label: "Your own",
  tag: "CUSTOM",
  character: "Your own",
  title: "Your own character",
  callName: "A call with your character",
  blurb: "Describe who to fool: a landlord, an investor, your future in-laws.",
  defaultGoal: "Convince them you are who you say you are.",
  art: "custom-male",
  tint: "#fff1c2",
  accent: "#ff9600",
};

export const GROUP_PRESET: ScenarioPreset = {
  id: "group",
  label: "Your own crowd",
  tag: "CUSTOM",
  character: "Your crowd",
  title: "2-3 characters you write",
  callName: "A call with your crowd",
  blurb: "Write 2-3 characters and get grilled by all of them at once.",
  defaultGoal: "Convince the whole group you are who you say you are.",
  art: "custom-female",
  tint: "#ffe3f3",
  accent: "#ff86d0",
};

/** One person on the call. `label` is their multi-voice tag (empty for 1-on-1 scenes). */
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

const GROUP_LOOKS: Pick<CastMember, "tint" | "accent">[] = [
  { tint: "#fff1c2", accent: "#ff9600" },
  { tint: "#ffe3f3", accent: "#ff86d0" },
  { tint: "#ddf4ff", accent: "#1cb0f6" },
];

export const ALL_SCENES = [...PRESETS, PARTY_PRESET, CUSTOM_PRESET, GROUP_PRESET];

export const isGroupScenario = (id: ScenarioId) => id === "party" || id === "group";

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
  return ALL_SCENES.find((p) => p.id === id) ?? CUSTOM_PRESET;
}

/** Everyone on the call, in stage order. */
export function castFor(setup: Pick<Setup, "scenarioId" | "custom" | "group">): CastMember[] {
  if (setup.scenarioId === "party") return PARTY_CAST;
  if (setup.scenarioId === "group" && setup.group) {
    return setup.group.characters.map((c, i) => ({
      name: c.name,
      title: c.personality.split(/[.,]/)[0].slice(0, 40),
      label: voiceLabel(c.voiceId),
      expertise: c.expertise || "nothing in particular (judges mostly on consistency and confidence)",
      art: (c.art as Art) || "custom-male",
      ...GROUP_LOOKS[i % GROUP_LOOKS.length],
    }));
  }
  const p = presetFor(setup.scenarioId);
  const custom = setup.scenarioId === "custom" ? setup.custom : undefined;
  return [
    {
      name: custom?.name ?? p.character,
      title: custom ? custom.personality.split(/[.,]/)[0].slice(0, 40) || "Your character" : p.title,
      label: "",
      expertise: "",
      art: (custom?.art as Art) || p.art,
      tint: p.tint,
      accent: p.accent,
    },
  ];
}

/** Display name for a scene's cast ("Sam", "Maya, Theo & Jordan"). */
export function castName(setup: Pick<Setup, "scenarioId" | "custom" | "group">): string {
  const names = castFor(setup).map((c) => c.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0];
}
