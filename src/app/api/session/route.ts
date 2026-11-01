import { VoiceConfigError, voiceConnectionFor } from "@/lib/elevenlabs";
import { estimateGap } from "@/lib/gap";
import { runHandler } from "@/lib/handler";
import { appUrl, errorResponse, parseBody } from "@/lib/http";
import { CreateSessionBodySchema } from "@/lib/schemas";
import { createSession, toPublic } from "@/lib/sessions";
import type { CreateSessionResponse } from "@/lib/types";

/** Start a scene: larp gap (if the setup screen didn't already estimate it), NPC token, handler brief. */
export async function POST(req: Request) {
  const body = await parseBody(req, CreateSessionBodySchema);
  if (!body.ok) return body.res;
  const { profile, setup } = body.data;
  if (setup.scenarioId === "custom" && !setup.custom) {
    return Response.json({ error: "Custom scenario needs a character" }, { status: 400 });
  }

  try {
    const [gap, voice] = await Promise.all([
      body.data.gap ?? estimateGap(profile, setup.alias, setup.claims),
      voiceConnectionFor(setup),
    ]);
    const session = createSession(profile, setup, gap, appUrl(req));
    runHandler(session, (h) => h.sendBrief(session));
    const res: CreateSessionResponse = { state: toPublic(session), voice };
    return Response.json(res);
  } catch (err) {
    return errorResponse(err, err instanceof VoiceConfigError ? 503 : 502);
  }
}
