import { fmtMinutes } from "./context";
import { isGroupScenario, voiceLabel } from "./presets";
import { fill, loadPrompt, promptHash, type PromptName } from "./prompts";
import type { Setup } from "./schemas";

/**
 * The NPC's prompt, built from prompts/npc/ for each conversation and sent as an ElevenLabs
 * override. The repo is the only copy: the agents themselves only hold voice, LLM and settings
 * (scripts/create-agents.ts), so an edited character can't drift from what the live agent plays.
 *
 * Everything in here is visible to the browser. That's fine: it is the character sheet plus the
 * cover story, never the player's real profile.
 */

/**
 * Player-typed text goes straight into the prompt override, and ElevenLabs reads {{name}} there as a
 * dynamic variable (none are sent, so the call could fail to start). Break up any brace pairs.
 */
export function inertBraces(text: string): string {
  return text.replace(/\{(?=\{)/g, "{ ").replace(/\}(?=\})/g, "} ");
}

/** Scene details the character sheets and first messages use. */
export function npcVariables(setup: Setup): Record<string, string> {
  const vars: Record<string, string> = {
    alias: setup.alias,
    cover_story: setup.claims.map((c) => `- ${c}`).join("\n"),
    scene_goal: setup.goal,
    time_limit_minutes: fmtMinutes(setup.timeLimitSec),
  };
  if (setup.scenarioId === "group" && setup.group) {
    const chars = setup.group.characters;
    vars.cast = chars
      .map(
        (c) =>
          `- ${c.name} speaks inside <${voiceLabel(c.voiceId)}> tags. Personality: ${c.personality}${
            c.expertise ? ` Knows a lot about: ${c.expertise}. Asks mostly about that.` : ""
          }`,
      )
      .join("\n");
    vars.setting = setup.group.setting || "A casual group conversation.";
    vars.first_message = chars
      .map((c, i) => {
        const tag = voiceLabel(c.voiceId);
        return i === chars.length - 1 ? `<${tag}>And I'm ${c.name}. Who are you?</${tag}>` : `<${tag}>${i === 0 ? "Oh hey! " : ""}I'm ${c.name}.</${tag}>`;
      })
      .join(" ");
  }
  if (setup.scenarioId === "custom" && setup.custom) {
    vars.character_name = setup.custom.name;
    vars.character_personality = setup.custom.personality;
    vars.character_setting = setup.custom.setting || "A casual first meeting.";
  }
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, inertBraces(v)]));
}

/** The prompt files one scenario is built from: its character sheet, then the shared rules. */
export function npcPromptFiles(scenarioId: Setup["scenarioId"]): [`npc/${Setup["scenarioId"]}`, PromptName] {
  return [`npc/${scenarioId}`, isGroupScenario(scenarioId) ? "npc/_group_rules" : "npc/_rules"];
}

/** The full system prompt and first message for this conversation, plus the hash of the files they came from. */
export function npcPrompt(setup: Setup): { prompt: string; firstMessage: string; hash: string } {
  const [sheet, rules] = npcPromptFiles(setup.scenarioId);
  const vars = npcVariables(setup);
  return {
    prompt: fill(`${loadPrompt(sheet).body}\n\n${loadPrompt(rules).body}`, vars),
    firstMessage: fill(loadPrompt(sheet).meta.first_message, vars),
    hash: promptHash(sheet, rules),
  };
}
