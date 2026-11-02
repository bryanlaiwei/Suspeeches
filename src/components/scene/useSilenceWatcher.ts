"use client";

import { useRef, useState } from "react";
import { SILENCE_FIRST_SEC, SILENCE_REPEAT_SEC } from "@/lib/scoring";

/**
 * Silence on the player's turn. Call `check` every tick with when their turn started (scene
 * seconds) or null when it isn't their turn. Each time a penalty is due (first after
 * SILENCE_FIRST_SEC, then every SILENCE_REPEAT_SEC) it calls `report`; the server has the final say.
 */
export function useSilenceWatcher(report: (sinceSec: number, nowSec: number) => void) {
  const [silentFor, setSilentFor] = useState(0);
  /** Next report we owe the server for the current silent stretch. */
  const due = useRef<{ since: number; strikes: number } | null>(null);

  function check(sinceSec: number | null, nowSec: number) {
    if (sinceSec === null) {
      due.current = null;
      setSilentFor(0);
      return;
    }
    const quiet = nowSec - sinceSec;
    setSilentFor(quiet);
    if (!due.current || due.current.since !== sinceSec) due.current = { since: sinceSec, strikes: 0 };
    if (quiet < SILENCE_FIRST_SEC + due.current.strikes * SILENCE_REPEAT_SEC) return;
    due.current.strikes++;
    report(sinceSec, nowSec);
  }

  return { silentFor, check };
}

/** Seconds of silence at which the next penalty lands. */
export function nextSilenceAt(quiet: number): number {
  if (quiet < SILENCE_FIRST_SEC) return SILENCE_FIRST_SEC;
  return SILENCE_FIRST_SEC + Math.ceil((quiet - SILENCE_FIRST_SEC + 0.001) / SILENCE_REPEAT_SEC) * SILENCE_REPEAT_SEC;
}
