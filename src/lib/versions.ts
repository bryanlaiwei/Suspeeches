import { env, llmMock } from "./env";
import { npcPromptFiles } from "./npcPrompt";
import { promptHash } from "./prompts";
import type { Setup } from "./schemas";
import type { GameVersions } from "./types";

/**
 * Which prompt files (content hashes) and models a game ran on. Saved with every game, so after
 * changing a prompt or a model you can compare games played before and after the change.
 */
export function gameVersions(setup: Setup): GameVersions {
  const model = (name: string) => (llmMock() ? "mock" : name);
  return {
    judge: { model: model(env.judgeModel), prompt: promptHash("judge") },
    gap: { model: model(env.gapModel), prompt: promptHash("gap") },
    summarizer: { model: model(env.summaryModel), prompt: promptHash("summarizer") },
    npc: { prompt: promptHash(...npcPromptFiles(setup.scenarioId), "npc/_moods") },
  };
}
