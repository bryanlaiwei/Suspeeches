import { getSession, toPublic } from "@/lib/sessions";

export async function GET(_req: Request, ctx: RouteContext<"/api/session/[id]">) {
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s) return Response.json({ error: "Session not found (the server may have restarted)" }, { status: 404 });
  return Response.json({ state: toPublic(s) });
}
