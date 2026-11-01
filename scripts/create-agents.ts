/**
 * Creates one ElevenLabs agent per scenario from prompts/npc/*.md and prints the env lines.
 *
 *   ELEVENLABS_API_KEY=... npm run agents:create            # all four
 *   ELEVENLABS_API_KEY=... npm run agents:create recruiter  # just one
 *
 * Each agent gets: character sheet + shared rules as its system prompt (with {{dynamic variables}}
 * for the cover story), its own voice and LLM, the end_call system tool, the client events the app
 * listens to, and (custom agent only) the tts.voice_id override so players can pick a voice.
 * Endpoint: POST https://api.elevenlabs.io/v1/convai/agents/create
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../src/lib/prompts";

const SCENARIOS = ["recruiter", "bartender", "networking", "custom"] as const;

const PLACEHOLDERS: Record<string, string> = {
  alias: "Alex",
  cover_story: "- I'm a product designer with five years of experience",
  scene_goal: "Make a good impression",
  time_limit_minutes: "5",
  character_name: "Morgan",
  character_personality: "Friendly, curious and a little nosy.",
  character_setting: "A casual first meeting at a coffee shop.",
};

function load(file: string) {
  return parseFrontmatter(readFileSync(path.join(process.cwd(), "prompts", "npc", file), "utf8"));
}

async function createAgent(scenario: (typeof SCENARIOS)[number], apiKey: string): Promise<string> {
  const sheet = load(`${scenario}.v1.md`);
  const rules = load("_rules.v1.md");
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
      tts: { voice_id: sheet.meta.voice_id },
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
        ],
      },
    },
    ...(scenario === "custom"
      ? { platform_settings: { overrides: { conversation_config_override: { tts: { voice_id: true } } } } }
      : {}),
  };

  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${scenario}: ${res.status} ${text.slice(0, 600)}`);
  const { agent_id } = JSON.parse(text) as { agent_id: string };
  return agent_id;
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Set ELEVENLABS_API_KEY first (e.g. in .env.local).");
    process.exit(1);
  }
  const only = process.argv[2];
  const targets = SCENARIOS.filter((s) => !only || s === only);
  if (!targets.length) {
    console.error(`Unknown scenario "${only}". Use one of: ${SCENARIOS.join(", ")}`);
    process.exit(1);
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
