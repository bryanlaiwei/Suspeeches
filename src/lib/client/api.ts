"use client";

import type { GapResult, Profile, ScenarioId, Setup } from "../schemas";
import { authHeaders } from "./supabase";
import type {
  CreateSessionResponse,
  EventResponse,
  EventStreamLine,
  PublicSessionState,
  ScoreResponse,
  SilenceResponse,
  Timing,
} from "../types";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

/** Post a transcript line and read the streamed reply (EventStreamLine per line): `score` early, then `done`. */
async function postEvent(url: string, body: unknown, onScore?: (score: ScoreResponse) => void): Promise<EventResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    let nl: number;
    while ((nl = buffered.indexOf("\n")) >= 0) {
      const text = buffered.slice(0, nl).trim();
      buffered = buffered.slice(nl + 1);
      if (!text) continue;
      const line = JSON.parse(text) as EventStreamLine;
      if ("score" in line) onScore?.(line.score);
      else if ("done" in line) return line.done;
      else throw new Error(line.error);
    }
  }
  throw new Error("The server stopped before finishing this line");
}

/**
 * The profile sent with suggest, gap and createSession is only used when accounts are off; for a
 * signed-in player the server loads their saved profile itself.
 */
export const api = {
  suggest: (profile: Profile, scenarioId: ScenarioId, existing: string[]) =>
    post<{ suggestions: { claim: string; why: string }[] }>("/api/suggest", { profile, scenarioId, existing }),
  /** `token` is the server's signature over this estimate; pass it back to createSession. */
  gap: (profile: Profile, alias: string, claims: string[]) =>
    post<{ gap: GapResult; token: string }>("/api/gap", { profile, alias, claims }),
  createSession: (profile: Profile, setup: Setup, gapToken?: string) =>
    post<CreateSessionResponse>("/api/session", { profile, setup, gapToken }),
  connected: (id: string) => post<{ state: PublicSessionState }>(`/api/session/${id}/connected`, {}),
  /** `onScore` gets a judged turn's score as soon as the judge has written it, ahead of the result. */
  event: (
    id: string,
    seq: number,
    role: "user" | "agent",
    text: string,
    timing: Timing,
    speaker?: string,
    onScore?: (score: ScoreResponse) => void,
  ) => postEvent(`/api/session/${id}/event`, { seq, role, text, timing, speaker }, onScore),
  silence: (id: string, silentSinceSec: number, tSec: number) =>
    post<SilenceResponse>(`/api/session/${id}/silence`, { silentSinceSec, tSec }),
  end: (id: string, reason: "timeout" | "npc_ended" | "left" | "error") =>
    post<{ state: PublicSessionState }>(`/api/session/${id}/end`, { reason }),
  debrief: (id: string) => post<{ state: PublicSessionState }>(`/api/session/${id}/debrief`, {}),
};
