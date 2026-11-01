import { runHandler } from "@/lib/handler";
import { appUrl, errorResponse } from "@/lib/http";
import { getSession, toPublic } from "@/lib/sessions";
import { buildDebrief } from "@/lib/summarize";

/** Runs the summarizer once per session (concurrent callers share the same promise). */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/debrief">) {
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s) return Response.json({ error: "Session not found (the server may have restarted)" }, { status: 404 });
  if (s.status === "live") return Response.json({ error: "Scene is still live" }, { status: 409 });

  try {
    if (!s.debrief) {
      s.debriefPromise ??= buildDebrief(s);
      s.debrief = await s.debriefPromise;
      const origin = appUrl(req);
      runHandler(s, (h) => h.sendDebrief(s, origin));
    }
    return Response.json({ state: toPublic(s) });
  } catch (err) {
    s.debriefPromise = null;
    return errorResponse(err, 502);
  }
}
