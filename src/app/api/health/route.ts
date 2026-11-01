import { connection } from "next/server";
import { env, llmMock, voiceMock } from "@/lib/env";
import { authEnabled } from "@/lib/supabase-server";

export async function GET() {
  await connection(); // always evaluate at request time
  return Response.json({
    ok: true,
    app: "Sus",
    mock: { llm: llmMock(), voice: voiceMock() },
    configured: {
      anthropic: !!env.anthropicKey,
      elevenlabs: !!env.elevenLabsKey,
      agents: Object.fromEntries(
        ["recruiter", "networking", "custom", "party", "group"].map((s) => [s, !!env.agentId(s)]),
      ),
      agentboxd: !!env.agentboxdKey,
      accounts: authEnabled(),
    },
    models: { judge: env.judgeModel, gap: env.gapModel, summary: env.summaryModel },
  });
}
