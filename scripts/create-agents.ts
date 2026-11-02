/**
 * Creates one ElevenLabs agent per scenario in src/lib/scenarios.ts and records its ID in
 * src/lib/agents.json (commit that file; agent IDs aren't secret).
 *
 *   npm run agents:create              # every scenario that has no agent yet
 *   npm run agents:create recruiter    # just one (add --force to replace an existing agent)
 *   npm run agents:update              # push voice/LLM/settings changes to the recorded agents
 *   npm run agents:check               # exit 1 if a live agent's settings differ from prompts/npc
 *   npm run agents:create -- --import-env  # one-off: copy legacy ELEVENLABS_AGENT_ID_* vars into agents.json
 *
 * The agents are private (authentication on) and hold only the voice(s), LLM and conversation
 * settings from each character file's frontmatter. The character's prompt and first message are
 * NOT stored on the agent: the app builds them from prompts/npc/ for every conversation and sends
 * them as overrides (src/lib/npcPrompt.ts), so prompt edits go live on the next deploy without
 * touching ElevenLabs. Each agent is tagged with a hash of the settings it holds, so
 * `agents:check` can tell when an update is due.
 * Endpoints: POST /v1/convai/agents/create, PATCH and GET /v1/convai/agents/{agent_id}.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { agentIdFor, AGENTS_PATH } from "../src/lib/agents";
import { loadPrompt } from "../src/lib/prompts";
import { SCENARIO_IDS, SCENARIOS, type ScenarioId } from "../src/lib/scenarios";

const API = "https://api.elevenlabs.io/v1/convai/agents";

/** What the agent says if the app ever fails to send the real prompt: loud, not a silently wrong character. */
const STUB_PROMPT =
  "You are a character in Suspeeches. The app sends your real instructions with every conversation. If you are reading this, they were not sent: say there is a technical problem with the call, then stay silent.";

export function agentBody(scenario: ScenarioId) {
  const { meta } = loadPrompt(`npc/${scenario}`);
  // "Label|voice_id|description; ..." → ElevenLabs multi-voice supported_voices.
  const supportedVoices = ("voices" in meta ? meta.voices : "")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const [label, voice_id, description] = v.split("|").map((x) => x.trim());
      return { label, voice_id, description };
    });

  const config = {
    name: SCENARIOS[scenario].agentName,
    conversation_config: {
      agent: {
        first_message: "",
        language: "en",
        prompt: {
          prompt: STUB_PROMPT,
          llm: meta.llm,
          temperature: 0.7,
          // No end_call tool: only the app ends a scene (timer, caught, or the player leaving).
          built_in_tools: { end_call: null },
        },
      },
      tts: { voice_id: meta.voice_id, ...(supportedVoices.length ? { supported_voices: supportedVoices } : {}) },
      conversation: {
        max_duration_seconds: 660,
        client_events: [
          "conversation_initiation_metadata",
          "ping",
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
          "vad_score",
          // Raw LLM text as it streams: keeps the multi-voice tags, so the app knows who is talking.
          "agent_chat_response_part",
        ],
      },
    },
    platform_settings: {
      // Private agent: a conversation needs a token or signed URL minted with the server's API key
      // (src/lib/elevenlabs.ts). The IDs in agents.json are public, so without this anyone could
      // start a conversation on your account, with any prompt, since prompt overrides are on.
      auth: { enable_auth: true },
      overrides: {
        conversation_config_override: {
          // The app sends the prompt and first message every time (see the header comment).
          agent: { prompt: { prompt: true }, first_message: true },
          // Players pick the custom character's voice.
          ...(SCENARIOS[scenario].kind === "custom" ? { tts: { voice_id: true } } : {}),
        },
      },
    },
  };
  return { ...config, tags: ["sus", `scenario:${scenario}`, `config:${configHash(config)}`] };
}

function configHash(config: unknown): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 12);
}

async function call(method: "POST" | "PATCH" | "GET", url: string, apiKey: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "xi-api-key": apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 600)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

const agentsFile = path.join(process.cwd(), AGENTS_PATH);

/** Record agent IDs in src/lib/agents.json, keeping the registry's order. */
function recordAgents(ids: Partial<Record<ScenarioId, string>>) {
  const current = JSON.parse(readFileSync(agentsFile, "utf8")) as Partial<Record<string, string>>;
  const merged = Object.fromEntries(SCENARIO_IDS.flatMap((s) => ((ids[s] ?? current[s]) ? [[s, ids[s] ?? current[s]]] : [])));
  writeFileSync(agentsFile, `${JSON.stringify(merged, null, 2)}\n`);
}

async function main() {
  const mode = process.argv.includes("--update")
    ? "update"
    : process.argv.includes("--check")
      ? "check"
      : process.argv.includes("--import-env")
        ? "import-env"
        : "create";
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const targets = SCENARIO_IDS.filter((s) => !only || s === only);
  if (!targets.length) {
    console.error(`Unknown scenario "${only}". Use one of: ${SCENARIO_IDS.join(", ")}`);
    process.exit(1);
  }

  if (mode === "import-env") {
    const ids = Object.fromEntries(targets.flatMap((s) => {
      const id = process.env[`ELEVENLABS_AGENT_ID_${s.toUpperCase()}`];
      return id ? [[s, id]] : [];
    }));
    recordAgents(ids);
    console.log(`Recorded ${Object.keys(ids).join(", ") || "nothing"} in ${AGENTS_PATH}. Commit it; the env vars can then go.`);
    process.exit(0);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Set ELEVENLABS_API_KEY first (e.g. in .env.local).");
    process.exit(1);
  }

  if (mode === "create") {
    const force = process.argv.includes("--force");
    const created: Partial<Record<ScenarioId, string>> = {};
    let failed = 0;
    for (const scenario of targets) {
      const existing = agentIdFor(scenario);
      if (existing && !force) {
        console.log(`skip ${scenario}: already has agent ${existing.id} (use --force to replace it)`);
        continue;
      }
      try {
        const { agent_id } = (await call("POST", `${API}/create`, apiKey, agentBody(scenario))) as { agent_id: string };
        console.log(`created ${scenario}: ${agent_id}`);
        created[scenario] = agent_id;
      } catch (err) {
        failed++;
        console.error(`failed ${scenario}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (Object.keys(created).length) {
      recordAgents(created);
      console.log(`\nRecorded in ${AGENTS_PATH}. Commit it.`);
    }
    process.exit(failed ? 1 : 0);
  }

  let failed = 0;
  for (const scenario of targets) {
    const id = agentIdFor(scenario)?.id;
    if (!id) {
      console.error(`skip ${scenario}: no agent in ${AGENTS_PATH} (run \`npm run agents:create ${scenario}\`)`);
      failed++;
      continue;
    }
    const url = `${API}/${encodeURIComponent(id)}`;
    try {
      if (mode === "update") {
        await call("PATCH", url, apiKey, agentBody(scenario));
        console.log(`updated ${scenario}: ${id}`);
        continue;
      }
      const want = agentBody(scenario).tags.find((t) => t.startsWith("config:"))!;
      const live = ((await call("GET", url, apiKey)).tags as string[] | undefined) ?? [];
      if (live.includes(want)) {
        console.log(`ok ${scenario}`);
      } else {
        failed++;
        console.error(`out of date ${scenario}: run \`npm run agents:update\` (live ${live.find((t) => t.startsWith("config:")) ?? "untagged"}, repo ${want})`);
      }
    } catch (err) {
      failed++;
      console.error(`failed ${scenario}: ${err instanceof Error ? err.message : err}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith("create-agents.ts")) void main();
