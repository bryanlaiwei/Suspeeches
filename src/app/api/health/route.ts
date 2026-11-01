import { connection } from "next/server";
import { env, llmMock, voiceMock } from "@/lib/env";

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
        ["recruiter", "networking", "custom"].map((s) => [s, !!env.agentId(s)]),
      ),
      agentboxd: !!env.agentboxdKey,
    },
    models: { judge: env.judgeModel, gap: env.gapModel, summary: env.summaryModel },
  });
}
