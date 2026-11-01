import { sendFollowupNow } from "@/lib/handler";
import { errorResponse } from "@/lib/http";
import { getSession, toPublic } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase-server";

/** Retry sending this game's in-character follow-up (e.g. after a send error). */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/followup">) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s) return Response.json({ error: "This game is no longer on the server (it may have restarted)." }, { status: 404 });
  if (auth.owner && s.owner && s.owner.userId !== auth.owner.userId) {
    return Response.json({ error: "Not your game." }, { status: 403 });
  }
  const email = s.profile.email || auth.owner?.email || "";
  if (!email) return Response.json({ error: "Sign in to get the follow-up by email." }, { status: 400 });
  try {
    await sendFollowupNow(s, email);
    return Response.json({ state: toPublic(s) });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
