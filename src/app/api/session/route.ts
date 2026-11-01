import { VoiceConfigError, voiceConnectionFor } from "@/lib/elevenlabs";
import { estimateGap } from "@/lib/gap";
import { appUrl, errorResponse, parseBody } from "@/lib/http";
import { CreateSessionBodySchema } from "@/lib/schemas";
import { createSession, toPublic } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase-server";
import type { CreateSessionResponse } from "@/lib/types";

/** Start a scene: larp gap (if the setup screen didn't already estimate it) and the NPC connection. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, CreateSessionBodySchema);
  if (!body.ok) return body.res;
  const { setup } = body.data;
  // Follow-up emails go to the profile email, or the sign-in email if the profile has none.
  const profile = { ...body.data.profile, email: body.data.profile.email || auth.owner?.email || "" };
  if (setup.scenarioId === "custom" && !setup.custom) {
    return Response.json({ error: "Custom scenario needs a character" }, { status: 400 });
  }

  try {
    const [gap, voice] = await Promise.all([
      body.data.gap ?? estimateGap(profile, setup.alias, setup.claims),
      voiceConnectionFor(setup),
    ]);
    const session = createSession(profile, setup, gap, appUrl(req), auth.owner);
    const res: CreateSessionResponse = { state: toPublic(session), voice };
    return Response.json(res);
  } catch (err) {
    return errorResponse(err, err instanceof VoiceConfigError ? 503 : 502);
  }
}
