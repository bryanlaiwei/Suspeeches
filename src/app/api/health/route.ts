import { connection } from "next/server";
import { env, llmMock, voiceMock } from "@/lib/env";
import { agentIdFor } from "@/lib/agents";
import { SCENARIO_IDS } from "@/lib/scenarios";
import { sessionStore } from "@/lib/sessionStore";
import { adminClient, authEnabled } from "@/lib/supabase-server";

export async function GET() {
  await connection(); // always evaluate at request time
  return Response.json({
    ok: true,
    app: "Suspeeches",
    mock: { llm: llmMock(), voice: voiceMock() },
    configured: {
      anthropic: !!env.anthropicKey,
      elevenlabs: !!env.elevenLabsKey,
      /** Where each scenario's agent ID comes from: "file" (agents.json), "env" (legacy var) or null. */
      agents: Object.fromEntries(SCENARIO_IDS.map((s) => [s, agentIdFor(s)?.source ?? null])),
      accounts: authEnabled(),
      /** Finished games get saved to players' history (accounts on and SUPABASE_SECRET_KEY set). */
      history: authEnabled() && !!adminClient(),
      /** Live sessions in Supabase (SUPABASE_SECRET_KEY) rather than this process's memory. */
      durableSessions: sessionStore().durable,
      appSecret: !!process.env.APP_SECRET,
    },
    models: { judge: env.judgeModel, gap: env.gapModel, summary: env.summaryModel },
  });
}
