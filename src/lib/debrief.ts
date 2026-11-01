import { runHandler } from "./handler";
import type { Session } from "./sessions";
import { buildDebrief } from "./summarize";
import type { Debrief } from "./types";

/**
 * Start writing the debrief as soon as the scene ends (idempotent), and email it via the handler
 * the moment it's ready, whether or not anyone has the debrief page open.
 */
export function startDebrief(s: Session): Promise<Debrief> {
  s.debriefPromise ??= buildDebrief(s).then(
    (d) => {
      s.debrief = d;
      runHandler(s, (h) => h.sendDebrief(s, s.appUrl));
      return d;
    },
    (err) => {
      s.debriefPromise = null; // let the next caller retry
      throw err;
    },
  );
  return s.debriefPromise;
}
