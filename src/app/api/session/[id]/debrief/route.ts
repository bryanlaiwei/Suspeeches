import { startDebrief } from "@/lib/debrief";
import { errorResponse } from "@/lib/http";
import { getSession, toPublic } from "@/lib/sessions";

/** Returns the debrief, waiting for it if the summarizer (started when the scene ended) is still running. */
export async function POST(_req: Request, ctx: RouteContext<"/api/session/[id]/debrief">) {
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s) return Response.json({ error: "Session not found (the server may have restarted)" }, { status: 404 });
  if (s.status === "live") return Response.json({ error: "Scene is still live" }, { status: 409 });

  try {
    await startDebrief(s);
    return Response.json({ state: toPublic(s) });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
