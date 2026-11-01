import { characterName } from "./context";
import { env, voiceMock } from "./env";
import { mockNpcLines } from "./mock";
import type { Setup } from "./schemas";
import type { VoiceConnection } from "./types";

const API = "https://api.elevenlabs.io";

export class VoiceConfigError extends Error {}

/**
 * Everything the browser needs to start the NPC. The agent learns the cover story only
 * through these dynamic variables; the real profile never goes to ElevenLabs.
 */
export async function voiceConnectionFor(setup: Setup): Promise<VoiceConnection> {
  if (voiceMock()) {
    const { firstMessage, lines } = mockNpcLines(characterName(setup));
    return { mode: "mock", firstMessage, lines };
  }

  const agentId = env.agentId(setup.scenarioId);
  if (!agentId) {
    throw new VoiceConfigError(
      `ELEVENLABS_AGENT_ID_${setup.scenarioId.toUpperCase()} is not set. Run \`npm run agents:create\` and add the printed IDs to your env.`,
    );
  }

  const conversationToken = await getConversationToken(agentId);
  const dynamicVariables: Record<string, string> = {
    alias: setup.alias,
    cover_story: setup.claims.map((c) => `- ${c}`).join("\n"),
    scene_goal: setup.goal,
    time_limit_minutes: String(Math.max(1, Math.round(setup.timeLimitSec / 60))),
  };

  if (setup.scenarioId === "custom" && setup.custom) {
    dynamicVariables.character_name = setup.custom.name;
    dynamicVariables.character_personality = setup.custom.personality;
    dynamicVariables.character_setting = setup.custom.setting || "A casual first meeting.";
    return {
      mode: "elevenlabs",
      conversationToken,
      dynamicVariables,
      // Requires the tts.voice_id override to be enabled on the custom agent (agents:create does this).
      overrides: { tts: { voiceId: setup.custom.voiceId } },
    };
  }
  return { mode: "elevenlabs", conversationToken, dynamicVariables };
}

/** WebRTC conversation token for a private agent (GET /v1/convai/conversation/token). */
async function getConversationToken(agentId: string): Promise<string> {
  const res = await fetch(`${API}/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": env.elevenLabsKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new VoiceConfigError(`ElevenLabs token request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new VoiceConfigError("ElevenLabs token response had no token");
  return json.token;
}
