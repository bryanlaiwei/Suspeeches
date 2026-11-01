import type { ScenarioId, Setup } from "./schemas";

/** Client-safe scenario metadata. Agent config (voice, LLM, prompt) lives in prompts/npc/*.md. */
export interface ScenarioPreset {
  id: ScenarioId;
  label: string;
  character: string;
  title: string;
  blurb: string;
  defaultGoal: string;
  /** Avatar art folder under public/avatars, and the tile tint. */
  avatar: string;
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
    avatar: "dana",
    accent: "#1cb0f6",
  },
  {
    id: "networking",
    label: "Networking mixer",
    character: "Priya",
    title: "Founder at a startup mixer",
    blurb: "Fast talker, sizing you up as a hire, partner or intro.",
    defaultGoal: "Get Priya to offer an intro to her investor.",
    avatar: "priya",
    accent: "#19c39c",
  },
];

/** Group scenes: one ElevenLabs agent voices several characters (multi-voice). */
export const PARTY_PRESET: ScenarioPreset = {
  id: "party",
  label: "Startup interview",
  character: "Maya, Theo & Jordan",
  title: "Interview panel at Lumen",
  blurb: "A CTO, a CEO and a design lead interview you at once. Three people, one cover story.",
  defaultGoal: "Get an offer to join Lumen.",
  avatar: "maya",
  accent: "#ff9600",
};

export const GROUP_PRESET: ScenarioPreset = {
  id: "group",
  label: "Custom group",
  character: "Your group",
  title: "2-3 characters you write",
  blurb: "Build your own group of up to three characters.",
  defaultGoal: "Convince the whole group you are who you say you are.",
  avatar: "group-f2",
  accent: "#ffc800",
};

/** One person on stage. `label` is their multi-voice tag (empty for 1-on-1 scenes). */
export interface CastMember {
  name: string;
  title: string;
  label: string;
  /** What this character knows well enough to spot a faker (group scenes). */
  expertise: string;
  avatar: string;
  accent: string;
}

export const PARTY_CAST: CastMember[] = [
  { name: "Maya", title: "CTO", label: "Maya", expertise: "software engineering, system design, infrastructure, engineering teams and hiring", avatar: "maya", accent: "#ff9600" },
  { name: "Theo", title: "CEO & co-founder", label: "Theo", expertise: "business impact, revenue and growth metrics, fundraising, company culture, go-to-market", avatar: "sam", accent: "#a66bff" },
  { name: "Jordan", title: "Head of design", label: "Jordan", expertise: "product and visual design, UX research, design systems, design tools, design-engineering handoff", avatar: "jordan", accent: "#e64980" },
];

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

export const isGroupScenario = (id: ScenarioId) => id === "party" || id === "group";

export const CUSTOM_PRESET: ScenarioPreset = {
  id: "custom",
  label: "Custom character",
  character: "Custom",
  title: "Your own character",
  blurb: "Write your own character and goal.",
  defaultGoal: "Convince them you are who you say you are.",
  avatar: "custom-female",
  accent: "#58cc02",
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

export function presetFor(id: ScenarioId): ScenarioPreset {
  if (id === "party") return PARTY_PRESET;
  if (id === "group") return GROUP_PRESET;
  return PRESETS.find((p) => p.id === id) ?? CUSTOM_PRESET;
}

/** Everyone the player is talking to, in stage order. */
export function castFor(setup: Pick<Setup, "scenarioId" | "custom" | "group">): CastMember[] {
  if (setup.scenarioId === "party") return PARTY_CAST;
  if (setup.scenarioId === "group" && setup.group) {
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
  const p = presetFor(setup.scenarioId);
  const custom = setup.scenarioId === "custom" ? setup.custom : undefined;
  const { avatar, accent } = custom ? LOOKS[lookOf(custom.voiceId)][0] : p;
  return [{ name: custom?.name ?? p.character, title: custom ? "Custom character" : p.title, label: "", expertise: "", avatar, accent }];
}
