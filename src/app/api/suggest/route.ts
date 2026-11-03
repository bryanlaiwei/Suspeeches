import { suggestClaims } from "@/lib/gap";
import { errorResponse, parseBody } from "@/lib/http";
import { requireUser, trustedProfile } from "@/lib/supabaseServer";
import { SuggestBodySchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, SuggestBodySchema);
  if (!body.ok) return body.res;
  try {
    const trusted = await trustedProfile(auth.owner, body.data.profile);
    if (!trusted.ok) return trusted.res;
    const suggestions = await suggestClaims(trusted.profile, body.data.scenarioId, body.data.existing);
    return Response.json({ suggestions });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
