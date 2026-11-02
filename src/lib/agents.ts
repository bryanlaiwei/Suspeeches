import agentsFile from "./agents.json";
import type { ScenarioId } from "./scenarios";

/**
 * Which ElevenLabs agent plays each scenario. `npm run agents:create` writes src/lib/agents.json;
 * commit it. The IDs aren't secret: a private agent still needs the server's API key to start a
 * conversation.
 *
 * An ELEVENLABS_AGENT_ID_<SCENARIO> env var is still read when the file has no entry, so a deploy
 * that predates agents.json keeps working. Once the file is committed those vars can be deleted.
 */
export const AGENTS_PATH = "src/lib/agents.json";

const fromFile = agentsFile as Partial<Record<string, string>>;

export function agentIdFor(scenario: ScenarioId): { id: string; source: "file" | "env" } | null {
  const file = fromFile[scenario];
  if (file) return { id: file, source: "file" };
  const env = process.env[`ELEVENLABS_AGENT_ID_${scenario.toUpperCase()}`];
  return env ? { id: env, source: "env" } : null;
}
