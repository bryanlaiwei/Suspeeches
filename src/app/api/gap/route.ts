import { estimateGap } from "@/lib/gap";
import { gapBinding, signGap } from "@/lib/gapToken";
import { errorResponse, parseBody } from "@/lib/http";
import { requireUser, trustedProfile } from "@/lib/supabase-server";
import { GapBodySchema } from "@/lib/schemas";

/** Estimate the larp gap, signed so POST /api/session can trust it without asking the model again. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, GapBodySchema);
  if (!body.ok) return body.res;
  try {
    const trusted = await trustedProfile(auth.owner, body.data.profile);
    if (!trusted.ok) return trusted.res;
    const { alias, claims } = body.data;
    const gap = await estimateGap(trusted.profile, alias, claims);
    const token = signGap(gap, gapBinding(auth.owner?.userId ?? null, trusted.profile, alias, claims));
    return Response.json({ gap, token });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
