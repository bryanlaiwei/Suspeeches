import { characterName } from "./context";
import { env, voiceMock } from "./env";
import { mockGroupLines, mockNpcLines } from "./mock";
import { npcPrompt } from "./npcPrompt";
import { castFor, isGroupScenario } from "./presets";
import type { Setup } from "./schemas";
import type { VoiceConnection } from "./types";

const API = "https://api.elevenlabs.io";

export class VoiceConfigError extends Error {}

/**
 * Everything the browser needs to start the NPC: a credential, and the character's prompt and
 * first message as overrides (built from prompts/npc/ every time, see npcPrompt). The agent learns
 * the cover story only through those; the real profile never goes to ElevenLabs.
 */
export async function voiceConnectionFor(setup: Setup): Promise<VoiceConnection> {
  if (voiceMock()) {
    const { firstMessage, lines } = isGroupScenario(setup.scenarioId)
      ? mockGroupLines(castFor(setup))
      : mockNpcLines(characterName(setup));
    return { mode: "mock", firstMessage, lines };
  }

  const agentId = env.agentId(setup.scenarioId);
  if (!agentId) {
    throw new VoiceConfigError(
      `No ElevenLabs agent for "${setup.scenarioId}". Run \`npm run agents:create ${setup.scenarioId}\`, which records it in src/lib/agents.json, and commit that file.`,
    );
  }

  // Group scenes connect over WebSocket: only that transport reports when each audio chunk starts
  // playing (with per-character timings), which is what keeps the talking face in sync.
  const credential = isGroupScenario(setup.scenarioId)
    ? { signedUrl: await convaiCredential("get-signed-url", "signed_url", agentId) }
    : { conversationToken: await convaiCredential("token", "token", agentId) };
  const { prompt, firstMessage } = npcPrompt(setup);
  return {
    mode: "elevenlabs",
    ...credential,
    // Prompt and first message overrides are enabled on every agent by agents:create; the voice
    // override only on the custom agent, where the player picks the voice.
    overrides: {
      agent: { prompt: { prompt }, firstMessage },
      ...(setup.scenarioId === "custom" && setup.custom ? { tts: { voiceId: setup.custom.voiceId } } : {}),
    },
  };
}

/**
 * Short-lived credential for a private agent: a WebSocket signed URL
 * (GET /v1/convai/conversation/get-signed-url → signed_url) or a WebRTC conversation token
 * (GET /v1/convai/conversation/token → token).
 */
async function convaiCredential(endpoint: "get-signed-url" | "token", field: "signed_url" | "token", agentId: string): Promise<string> {
  const res = await fetch(`${API}/v1/convai/conversation/${endpoint}?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": env.elevenLabsKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new VoiceConfigError(`ElevenLabs ${endpoint} request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const value = ((await res.json()) as Record<string, unknown>)[field];
  if (typeof value !== "string" || !value) throw new VoiceConfigError(`ElevenLabs ${endpoint} response had no ${field}`);
  return value;
}
