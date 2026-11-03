import { loadSession, toPublic } from "@/lib/sessions";
import { requireOwner } from "@/lib/supabaseServer";

export async function GET(req: Request, ctx: RouteContext<"/api/session/[id]">) {
  const { id } = await ctx.params;
  const s = await loadSession(id);
  if (!s) return Response.json({ error: "Session not found (the server may have restarted)" }, { status: 404 });
  const auth = await requireOwner(req, s.owner);
  if (!auth.ok) return auth.res;
  return Response.json({ state: toPublic(s) });
}
