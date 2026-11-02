import { VoiceConfigError, voiceConnectionFor } from "@/lib/elevenlabs";
import { estimateGap } from "@/lib/gap";
import { gapBinding, verifyGap } from "@/lib/gapToken";
import { errorResponse, parseBody } from "@/lib/http";
import { CreateSessionBodySchema } from "@/lib/schemas";
import { createSession, toPublic } from "@/lib/sessions";
import { requireUser, trustedProfile } from "@/lib/supabase-server";
import type { CreateSessionResponse } from "@/lib/types";

/**
 * Start a scene. The real profile comes from the player's saved profile and the larp gap from a
 * signed /api/gap estimate made for exactly this profile and cover story; anything else is
 * estimated again here. Neither is taken from the request.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, CreateSessionBodySchema);
  if (!body.ok) return body.res;
  const setup = body.data.setup;
  if (setup.scenarioId === "custom" && !setup.custom) {
    return Response.json({ error: "Custom scenario needs a character" }, { status: 400 });
  }

  try {
    const trusted = await trustedProfile(auth.owner, body.data.profile);
    if (!trusted.ok) return trusted.res;
    const { profile } = trusted;
    const signed = verifyGap(body.data.gapToken, gapBinding(auth.owner?.userId ?? null, profile, setup.alias, setup.claims));
    const [gap, voice] = await Promise.all([signed ?? estimateGap(profile, setup.alias, setup.claims), voiceConnectionFor(setup)]);
    const session = await createSession(profile, setup, gap, auth.owner);
    const res: CreateSessionResponse = { state: toPublic(session), voice };
    return Response.json(res);
  } catch (err) {
    return errorResponse(err, err instanceof VoiceConfigError ? 503 : 502);
  }
}
