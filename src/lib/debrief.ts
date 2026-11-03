import { after } from "next/server";
import { toPublic, unchanged, updateSession, type Session } from "./sessions";
import { buildDebrief } from "./summarize";
import { saveGame } from "./supabase-server";

/**
 * After the call: write the debrief, then save the game to the player's history. It runs as a job
 * whose status lives on the session (and in the game_sessions table when sessions are durable), so
 * it survives a restart and can be retried:
 *
 * - The route that ends the scene schedules it with Next's after(), so it runs once the response
 *   is sent instead of as an untracked promise.
 * - Each step saves as it finishes, and a re-run skips the steps already done.
 * - A running job holds a lock for JOB_LOCK_MS, renewed after every step (the summarizer call is
 *   time-bounded to fit inside it). If its process dies, the debrief page's next poll finds the
 *   lock expired (or the job failed) and starts it again, up to MAX_AUTO_ATTEMPTS times.
 */
export const JOB_LOCK_MS = 5 * 60_000;
export const MAX_AUTO_ATTEMPTS = 3;

/** Whether the job should be (re)started now. */
export function jobDue(s: Session, now = Date.now()): boolean {
  if (s.status === "live") return false;
  switch (s.job.status) {
    case "pending":
      // Held while the judge's notes on the turn that ended the scene are still coming (sessions.ts).
      return (s.job.lockedUntil ?? 0) <= now;
    case "failed":
      return s.job.attempts < MAX_AUTO_ATTEMPTS;
    case "running":
      return (s.job.lockedUntil ?? 0) <= now;
    default:
      return false;
  }
}

/** Run the job once this request's response has been sent. */
export function scheduleDebrief(id: string): void {
  after(async () => {
    await runDebriefJob(id);
  });
}

/** Run (or resume) the job if it's due. Never throws; returns the latest session. */
export async function runDebriefJob(id: string): Promise<Session | null> {
  const claim = await updateSession(id, (s, now) => {
    if (!jobDue(s, now)) return unchanged(false);
    s.job = { status: "running", attempts: s.job.attempts + 1, error: null, lockedUntil: now + JOB_LOCK_MS };
    return true;
  });
  if (!claim?.value) return claim?.s ?? null;

  let s = claim.s;
  /** Save a finished step, and renew the lock so the next step gets a full JOB_LOCK_MS. */
  const save = async (fn: (x: Session) => void) => {
    const r = await updateSession(id, (x, now) => {
      fn(x);
      if (x.job.status === "running") x.job.lockedUntil = now + JOB_LOCK_MS;
      return null;
    });
    if (r) s = r.s;
  };

  try {
    if (!s.debrief) {
      const d = await buildDebrief(s);
      await save((x) => void (x.debrief ??= d));
    }
    if (s.owner) await saveGame(s.owner, toPublic(s));
    await save((x) => void (x.job = { ...x.job, status: "done", error: null, lockedUntil: null }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[debrief job]", message);
    await save((x) => void (x.job = { ...x.job, status: "failed", error: message, lockedUntil: null })).catch(() => undefined);
  }
  return s;
}
