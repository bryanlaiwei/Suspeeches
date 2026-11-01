import { estimateGap } from "@/lib/gap";
import { errorResponse, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/supabase-server";
import { GapBodySchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, GapBodySchema);
  if (!body.ok) return body.res;
  try {
    const gap = await estimateGap(body.data.profile, body.data.alias, body.data.claims);
    return Response.json({ gap });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
