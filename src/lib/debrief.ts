import { runHandler } from "./handler";
import { saveGame } from "./supabase-server";
import { toPublic, type Session } from "./sessions";
import { buildFollowup } from "./followup";
import { buildDebrief } from "./summarize";
import type { Debrief } from "./types";

/**
 * Start writing the debrief as soon as the scene ends (idempotent), then the character's
 * follow-up email, which is sent the moment it's ready, whether or not anyone has the debrief
 * page open. The follow-up is the only email Suspeeches sends.
 */
export function startDebrief(s: Session): Promise<Debrief> {
  s.debriefPromise ??= buildDebrief(s).then(
    async (d) => {
      s.debrief = d;
      s.followup = await buildFollowup(s, d).catch((err) => {
        console.error("[followup]", err instanceof Error ? err.message : err);
        return null;
      });
      runHandler(s, (h) => h.sendFollowup(s));
      if (s.owner) void saveGame(s.owner, toPublic(s));
      return d;
    },
    (err) => {
      s.debriefPromise = null; // let the next caller retry
      throw err;
    },
  );
  return s.debriefPromise;
}
