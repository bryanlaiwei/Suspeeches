/**
 * Every scenario, in the order the setup screen shows them. This is the one place to add one:
 *
 *   1. Add an entry here.
 *   2. Write prompts/npc/<id>.md: the character sheet, plus the agent's voice, LLM and first
 *      message in its frontmatter. (TypeScript fails until it exists.)
 *   3. Run `npm run agents:create <id>`. It creates the ElevenLabs agent and records its ID in
 *      src/lib/agents.json; commit that file. Agent IDs aren't secret: starting a conversation
 *      with a private agent still needs the server's API key.
 *
 * The zod enum (schemas.ts), the presets and cast (presets.ts), the setup picker, the health check
 * and scripts/create-agents.ts all read this. It's client-safe: no secrets, no Node imports.
 */

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

export interface ScenarioDef {
  /**
   * - character: one fixed character.
   * - panel: a fixed cast voiced by one multi-voice agent (`cast` lists them).
   * - custom: one character the player writes, in a voice they pick.
   * - group: 2-3 characters the player writes, one multi-voice agent.
   */
  kind: "character" | "panel" | "custom" | "group";
  label: string;
  /** Who the player meets, as shown in the app (first name, or the cast). */
  character: string;
  title: string;
  blurb: string;
  defaultGoal: string;
  /** Avatar art folder under public/avatars, and the tile tint. */
  avatar: string;
  accent: string;
  /** The ElevenLabs agent's display name. */
  agentName: string;
  /** Panel scenes: everyone on stage, in stage order. */
  cast?: CastMember[];
}

export const SCENARIOS = {
  recruiter: {
    kind: "character",
    label: "Recruiter screen",
    character: "Dana",
    title: "Senior technical recruiter",
    blurb: "A brisk phone screen. Dana has read a thousand padded résumés.",
    defaultGoal: "Get Dana to move you forward to the hiring-manager round.",
    avatar: "dana",
    accent: "#1cb0f6",
    agentName: "Suspeeches - Recruiter (Dana)",
  },
  networking: {
    kind: "character",
    label: "Networking mixer",
    character: "Priya",
    title: "Founder at a startup mixer",
    blurb: "Fast talker, sizing you up as a hire, partner or intro.",
    defaultGoal: "Get Priya to offer an intro to her investor.",
    avatar: "priya",
    accent: "#19c39c",
    agentName: "Suspeeches - Networking (Priya)",
  },
  party: {
    kind: "panel",
    label: "Startup interview",
    character: "Maya, Theo & Jordan",
    title: "Interview panel at Lumen",
    blurb: "A CTO, a CEO and a design lead interview you at once. Three people, one cover story.",
    defaultGoal: "Get an offer to join Lumen.",
    avatar: "maya",
    accent: "#ff9600",
    agentName: "Suspeeches - Startup interview (Maya, Theo, Jordan)",
    cast: [
      { name: "Maya", title: "CTO", label: "Maya", expertise: "software engineering, system design, infrastructure, engineering teams and hiring", avatar: "maya", accent: "#ff9600" },
      { name: "Theo", title: "CEO & co-founder", label: "Theo", expertise: "business impact, revenue and growth metrics, fundraising, company culture, go-to-market", avatar: "theo", accent: "#a66bff" },
      { name: "Jordan", title: "Head of design", label: "Jordan", expertise: "product and visual design, UX research, design systems, design tools, design-engineering handoff", avatar: "jordan", accent: "#e64980" },
    ],
  },
  custom: {
    kind: "custom",
    label: "Custom character",
    character: "Custom",
    title: "Your own character",
    blurb: "Write your own character and goal.",
    defaultGoal: "Convince them you are who you say you are.",
    avatar: "custom-female",
    accent: "#58cc02",
    agentName: "Suspeeches - Custom character",
  },
  group: {
    kind: "group",
    label: "Custom group",
    character: "Your group",
    title: "2-3 characters you write",
    blurb: "Build your own group of up to three characters.",
    defaultGoal: "Convince the whole group you are who you say you are.",
    avatar: "group-f2",
    accent: "#ffc800",
    agentName: "Suspeeches - Custom group",
  },
} satisfies Record<string, ScenarioDef>;

export type ScenarioId = keyof typeof SCENARIOS;

/** All ids, in display order. */
export const SCENARIO_IDS = Object.keys(SCENARIOS) as [ScenarioId, ...ScenarioId[]];

export function scenarioDef(id: ScenarioId): ScenarioDef {
  return SCENARIOS[id];
}

/** Several characters on stage, voiced by one multi-voice agent. */
export const isGroupScenario = (id: ScenarioId) => {
  const { kind } = scenarioDef(id);
  return kind === "panel" || kind === "group";
};
