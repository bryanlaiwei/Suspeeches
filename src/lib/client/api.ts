"use client";

import type { GapResult, Profile, ScenarioId, Setup } from "../schemas";
import { authHeaders } from "./supabase";
import type { CreateSessionResponse, EventResponse, PublicSessionState, SilenceResponse, Timing } from "../types";

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
  event: (id: string, seq: number, role: "user" | "agent", text: string, timing: Timing, speaker?: string) =>
    post<EventResponse>(`/api/session/${id}/event`, { seq, role, text, timing, speaker }),
  silence: (id: string, silentSinceSec: number, tSec: number) =>
    post<SilenceResponse>(`/api/session/${id}/silence`, { silentSinceSec, tSec }),
  end: (id: string, reason: "timeout" | "npc_ended" | "left" | "error") =>
    post<{ state: PublicSessionState }>(`/api/session/${id}/end`, { reason }),
  debrief: (id: string) => post<{ state: PublicSessionState }>(`/api/session/${id}/debrief`, {}),
};
