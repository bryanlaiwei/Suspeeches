import type { z } from "zod";

/** Parse a JSON body with a zod schema; returns a 400 Response on failure. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: Response }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, res: Response.json({ error: "Body must be JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, res: Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

export function errorResponse(err: unknown, status = 500): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[api]", message);
  return Response.json({ error: message }, { status });
}

/** Public origin for links in emails; Render sets RENDER_EXTERNAL_URL. */
export function appUrl(req: Request): string {
  return process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || new URL(req.url).origin;
}
