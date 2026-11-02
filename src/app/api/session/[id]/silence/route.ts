import { scheduleDebrief } from "@/lib/debrief";
import { parseBody } from "@/lib/http";
import { SilenceBodySchema } from "@/lib/schemas";
import { addSilence } from "@/lib/sessions";

/** The browser reports a silence on the player's turn; the server decides if it costs suspicion. */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/silence">) {
  const { id } = await ctx.params;
  const body = await parseBody(req, SilenceBodySchema);
  if (!body.ok) return body.res;
  const out = await addSilence(id, body.data.silentSinceSec, body.data.tSec);
  if (!out) return Response.json({ error: "Session not found" }, { status: 404 });
  if (out.ended) scheduleDebrief(id);
  return Response.json(out.response);
}
