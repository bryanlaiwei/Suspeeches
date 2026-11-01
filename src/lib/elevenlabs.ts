import { characterName } from "./context";
import { env, voiceMock } from "./env";
import { mockGroupLines, mockNpcLines } from "./mock";
import { castFor, voiceLabel } from "./presets";
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
    const { firstMessage, lines } =
      setup.scenarioId === "party" || setup.scenarioId === "group"
        ? mockGroupLines(castFor(setup))
        : mockNpcLines(characterName(setup));
    return { mode: "mock", firstMessage, lines };
  }

  const agentId = env.agentId(setup.scenarioId);
  if (!agentId) {
    throw new VoiceConfigError(
      `ELEVENLABS_AGENT_ID_${setup.scenarioId.toUpperCase()} is not set. Run \`npm run agents:create\` and add the printed IDs to your env.`,
    );
  }

  // Group scenes connect over WebSocket: only that transport reports when each audio chunk starts
  // playing (with per-character timings), which is what keeps the talking face in sync.
  const group = setup.scenarioId === "party" || setup.scenarioId === "group";
  const credential = group ? { signedUrl: await getSignedUrl(agentId) } : { conversationToken: await getConversationToken(agentId) };
  const dynamicVariables: Record<string, string> = {
    alias: setup.alias,
    cover_story: setup.claims.map((c) => `- ${c}`).join("\n"),
    scene_goal: setup.goal,
    time_limit_minutes: String(Math.max(1, Math.round(setup.timeLimitSec / 60))),
  };

  if (setup.scenarioId === "group" && setup.group) {
    const chars = setup.group.characters;
    dynamicVariables.cast = chars
      .map(
        (c) =>
          `- ${c.name} speaks inside <${voiceLabel(c.voiceId)}> tags. Personality: ${c.personality}${
            c.expertise ? ` Knows a lot about: ${c.expertise}. Asks mostly about that.` : ""
          }`,
      )
      .join("\n");
    dynamicVariables.setting = setup.group.setting || "A casual group conversation.";
    dynamicVariables.first_message = chars
      .map((c, i) =>
        i === chars.length - 1
          ? `<${voiceLabel(c.voiceId)}>And I'm ${c.name}. Who are you?</${voiceLabel(c.voiceId)}>`
          : `<${voiceLabel(c.voiceId)}>${i === 0 ? "Oh hey! " : ""}I'm ${c.name}.</${voiceLabel(c.voiceId)}>`,
      )
      .join(" ");
  }

  if (setup.scenarioId === "custom" && setup.custom) {
    dynamicVariables.character_name = setup.custom.name;
    dynamicVariables.character_personality = setup.custom.personality;
    dynamicVariables.character_setting = setup.custom.setting || "A casual first meeting.";
    return {
      mode: "elevenlabs",
      ...credential,
      dynamicVariables,
      // Requires the tts.voice_id override to be enabled on the custom agent (agents:create does this).
      overrides: { tts: { voiceId: setup.custom.voiceId } },
    };
  }
  return { mode: "elevenlabs", ...credential, dynamicVariables };
}

/** WebSocket signed URL for a private agent (GET /v1/convai/conversation/get-signed-url). */
async function getSignedUrl(agentId: string): Promise<string> {
  const res = await fetch(`${API}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": env.elevenLabsKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new VoiceConfigError(`ElevenLabs signed URL request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { signed_url?: string };
  if (!json.signed_url) throw new VoiceConfigError("ElevenLabs signed URL response had no signed_url");
  return json.signed_url;
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
