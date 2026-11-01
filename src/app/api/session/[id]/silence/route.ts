import { parseBody } from "@/lib/http";
import { SilenceBodySchema } from "@/lib/schemas";
import { addSilence, getSession } from "@/lib/sessions";

/** The browser reports a silence on the player's turn; the server decides if it costs suspicion. */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/silence">) {
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s) return Response.json({ error: "Session not found" }, { status: 404 });
  const body = await parseBody(req, SilenceBodySchema);
  if (!body.ok) return body.res;
  return Response.json(await addSilence(s, body.data.silentSinceSec, body.data.tSec));
}
