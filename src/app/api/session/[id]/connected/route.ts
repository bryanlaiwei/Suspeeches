import { markConnected } from "@/lib/sessions";

/** The voice call connected. The scene clock starts now, on the server. */
export async function POST(_req: Request, ctx: RouteContext<"/api/session/[id]/connected">) {
  const { id } = await ctx.params;
  const state = await markConnected(id);
  if (!state) return Response.json({ error: "Session not found" }, { status: 404 });
  return Response.json({ state });
}
