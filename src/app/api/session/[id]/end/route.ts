import { scheduleDebrief } from "@/lib/debrief";
import { parseBody } from "@/lib/http";
import { EndBodySchema } from "@/lib/schemas";
import { endSession } from "@/lib/sessions";

/** The browser says the call ended. How long it lasted, and whether it was a timeout, is the server's call. */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/end">) {
  const { id } = await ctx.params;
  const body = await parseBody(req, EndBodySchema);
  if (!body.ok) return body.res;
  const out = await endSession(id, body.data.reason);
  if (!out) return Response.json({ error: "Session not found" }, { status: 404 });
  if (out.ended) scheduleDebrief(id);
  return Response.json(out.response);
}
