import { scheduleDebrief } from "@/lib/debrief";
import { parseBody } from "@/lib/http";
import { EventBodySchema } from "@/lib/schemas";
import { addEvent } from "@/lib/sessions";

/**
 * One transcript event from the live scene. Agent lines are recorded; user lines are judged.
 * The browser fires this without waiting, so the NPC keeps talking while the judge works.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/event">) {
  const { id } = await ctx.params;
  const body = await parseBody(req, EventBodySchema);
  if (!body.ok) return body.res;
  const { role, text, timing, seq, speaker } = body.data;
  const out = await addEvent(id, role, text, timing, seq, speaker);
  if (!out) return Response.json({ error: "Session not found" }, { status: 404 });
  if (out.ended) scheduleDebrief(id);
  return Response.json(out.response);
}
