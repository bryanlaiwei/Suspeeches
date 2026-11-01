import { estimateGap } from "@/lib/gap";
import { errorResponse, parseBody } from "@/lib/http";
import { GapBodySchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const body = await parseBody(req, GapBodySchema);
  if (!body.ok) return body.res;
  try {
    const gap = await estimateGap(body.data.profile, body.data.alias, body.data.claims);
    return Response.json({ gap });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
