import { parseBody } from "@/lib/http";
import { EndBodySchema } from "@/lib/schemas";
import { endSession, getSession, toPublic } from "@/lib/sessions";

export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/end">) {
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s) return Response.json({ error: "Session not found" }, { status: 404 });
  const body = await parseBody(req, EndBodySchema);
  if (!body.ok) return body.res;
  await endSession(s, body.data.reason, body.data.tSec);
  return Response.json({ state: toPublic(s) });
}
