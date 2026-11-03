import { jobDue, scheduleDebrief } from "@/lib/debrief";
import { loadSession, settleExpired, toPublic } from "@/lib/sessions";
import { requireOwner } from "@/lib/supabaseServer";

/**
 * The game's state for the debrief page, which polls this until the debrief (and email) are done.
 * Each poll also restarts the after-the-call job if it's pending, failed, or its worker died.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/debrief">) {
  const { id } = await ctx.params;
  let s = await loadSession(id);
  if (!s) return Response.json({ error: "Session not found (the server may have restarted)" }, { status: 404 });
  const auth = await requireOwner(req, s.owner);
  if (!auth.ok) return auth.res;

  // Time ran out on our clock but nobody ended the scene (tab closed, lost request).
  if (s.status === "live") s = (await settleExpired(id))?.response ?? s;
  if (s.status === "live") return Response.json({ error: "Scene is still live" }, { status: 409 });

  if (jobDue(s)) scheduleDebrief(id);
  return Response.json({ state: toPublic(s) });
}
