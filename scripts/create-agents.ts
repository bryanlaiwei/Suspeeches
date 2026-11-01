/**
 * Creates one ElevenLabs agent per scenario from prompts/npc/*.md and prints the env lines.
 *
 *   ELEVENLABS_API_KEY=... npm run agents:create            # all four
 *   ELEVENLABS_API_KEY=... npm run agents:create recruiter  # just one
 *   npm run agents:update                                   # push prompt/voice changes to the agents in .env.local
 *
 * Each agent gets: character sheet + shared rules as its system prompt (with {{dynamic variables}}
 * for the cover story), its own voice and LLM, the end_call system tool, the client events the app
 * listens to, and (custom agent only) the tts.voice_id override so players can pick a voice.
 * Endpoints: POST /v1/convai/agents/create, PATCH /v1/convai/agents/{agent_id} (update).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../src/lib/prompts";

const SCENARIOS = ["recruiter", "networking", "custom", "party", "group"] as const;
/** Group agents speak as several characters via ElevenLabs multi-voice tags. */
const GROUP_SCENARIOS = new Set<string>(["party", "group"]);

const PLACEHOLDERS: Record<string, string> = {
  alias: "Alex",
  cover_story: "- I'm a product designer with five years of experience",
  scene_goal: "Make a good impression",
  time_limit_minutes: "5",
  character_name: "Morgan",
  character_personality: "Friendly, curious and a little nosy.",
  character_setting: "A casual first meeting at a coffee shop.",
  cast: "- Morgan speaks inside <George> tags. Personality: friendly and curious.\n- Riley speaks inside <Rachel> tags. Personality: blunt and skeptical.",
  setting: "A casual group conversation at a friend's barbecue.",
  first_message: "<George>Oh hey, come join us!</George> <Rachel>Who are you?</Rachel>",
};

function load(file: string) {
  return parseFrontmatter(readFileSync(path.join(process.cwd(), "prompts", "npc", file), "utf8"));
}

function agentBody(scenario: (typeof SCENARIOS)[number]) {
  const sheet = load(`${scenario}.v1.md`);
  const rules = load(GROUP_SCENARIOS.has(scenario) ? "_group_rules.v1.md" : "_rules.v1.md");
  // "Label|voice_id|description; ..." → ElevenLabs multi-voice supported_voices.
  const supportedVoices = (sheet.meta.voices ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const [label, voice_id, description] = v.split("|").map((x) => x.trim());
      return { label, voice_id, description };
    });
  const prompt = `${sheet.body}\n\n${rules.body}`;
  const used = Object.fromEntries(
    Object.entries(PLACEHOLDERS).filter(([k]) => prompt.includes(`{{${k}}}`) || sheet.meta.first_message?.includes(`{{${k}}}`)),
  );

  const body = {
    name: sheet.meta.agent_name,
    tags: ["sus", `prompt:${scenario}.v${sheet.meta.version}`],
    conversation_config: {
      agent: {
        first_message: sheet.meta.first_message,
        language: "en",
        prompt: {
          prompt,
          llm: sheet.meta.llm,
          temperature: 0.7,
          built_in_tools: {
            end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } },
          },
        },
        dynamic_variables: { dynamic_variable_placeholders: used },
      },
      tts: { voice_id: sheet.meta.voice_id, ...(supportedVoices.length ? { supported_voices: supportedVoices } : {}) },
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
    ...(scenario === "custom"
      ? { platform_settings: { overrides: { conversation_config_override: { tts: { voice_id: true } } } } }
      : {}),
  };

  return body;
}

async function createAgent(scenario: (typeof SCENARIOS)[number], apiKey: string): Promise<string> {
  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(agentBody(scenario)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${scenario}: ${res.status} ${text.slice(0, 600)}`);
  const { agent_id } = JSON.parse(text) as { agent_id: string };
  return agent_id;
}

async function updateAgent(scenario: (typeof SCENARIOS)[number], agentId: string, apiKey: string): Promise<void> {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(agentBody(scenario)),
  });
  if (!res.ok) throw new Error(`${scenario}: ${res.status} ${(await res.text()).slice(0, 600)}`);
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Set ELEVENLABS_API_KEY first (e.g. in .env.local).");
    process.exit(1);
  }
  const update = process.argv.includes("--update");
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const targets = SCENARIOS.filter((s) => !only || s === only);
  if (!targets.length) {
    console.error(`Unknown scenario "${only}". Use one of: ${SCENARIOS.join(", ")}`);
    process.exit(1);
  }

  if (update) {
    let failed = 0;
    for (const scenario of targets) {
      const id = process.env[`ELEVENLABS_AGENT_ID_${scenario.toUpperCase()}`];
      if (!id) {
        console.error(`skip ${scenario}: ELEVENLABS_AGENT_ID_${scenario.toUpperCase()} not set`);
        failed++;
        continue;
      }
      try {
        await updateAgent(scenario, id, apiKey);
        console.log(`updated ${scenario}: ${id}`);
      } catch (err) {
        failed++;
        console.error(`failed ${err instanceof Error ? err.message : err}`);
      }
    }
    process.exit(failed ? 1 : 0);
  }

  const lines: string[] = [];
  for (const scenario of targets) {
    try {
      const id = await createAgent(scenario, apiKey);
      console.log(`created ${scenario}: ${id}`);
      lines.push(`ELEVENLABS_AGENT_ID_${scenario.toUpperCase()}=${id}`);
    } catch (err) {
      console.error(`failed ${err instanceof Error ? err.message : err}`);
    }
  }
  if (lines.length) console.log(`\nAdd these to .env.local and to Render:\n\n${lines.join("\n")}\n`);
  if (lines.length !== targets.length) process.exit(1);
}

void main();
