import { after } from "next/server";
import { runDebriefJob } from "@/lib/debrief";
import { parseBody } from "@/lib/http";
import { EventBodySchema } from "@/lib/schemas";
import { addEvent } from "@/lib/sessions";
import type { EventStreamLine } from "@/lib/types";

/**
 * One transcript event from the live scene. Agent lines are recorded; user lines are judged.
 * The browser fires this without waiting, so the NPC keeps talking while the judge works.
 *
 * The response streams one JSON object per line (EventStreamLine): a judged turn's score as soon as
 * the judge has written it, then the full result once its reply is done.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/session/[id]/event">) {
  const { id } = await ctx.params;
  const body = await parseBody(req, EventBodySchema);
  if (!body.ok) return body.res;
  const { role, text, timing, seq, speaker } = body.data;

  const encoder = new TextEncoder();
  let work!: ReturnType<typeof addEvent>;
  const stream = new ReadableStream<Uint8Array>({
    // Runs right away, inside the constructor.
    start(controller) {
      const send = (line: EventStreamLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // The browser went away; the turn still counts.
        }
      };
      work = addEvent(id, role, text, timing, seq, speaker, (score) => send({ score }));
      void work
        .then(
          (out) => send(out ? { done: out.response } : { error: "Session not found" }),
          (err) => {
            console.error("[api]", err instanceof Error ? err.message : err);
            send({ error: err instanceof Error ? err.message : String(err) });
          },
        )
        .finally(() => {
          try {
            controller.close();
          } catch {
            // Already closed by the browser going away.
          }
        });
    },
  });

  // If this turn ended the scene, write the debrief once the response is done.
  after(async () => {
    const out = await work.catch(() => null);
    if (out?.ended) await runDebriefJob(id);
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
