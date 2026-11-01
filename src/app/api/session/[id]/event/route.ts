import { parseBody } from "@/lib/http";
import { EventBodySchema } from "@/lib/schemas";
import { addEvent, getSession } from "@/lib/sessions";

/**
 * One transcript event from the live scene. Agent lines are recorded; user lines are judged.
 * The browser fires this without waiting, so the NPC keeps talking while the judge works.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/event">) {
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s) return Response.json({ error: "Session not found" }, { status: 404 });
  const body = await parseBody(req, EventBodySchema);
  if (!body.ok) return body.res;
  return Response.json(await addEvent(s, body.data.role, body.data.text, body.data.timing));
}
