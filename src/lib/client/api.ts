"use client";

import type { GapResult, Profile, ScenarioId, Setup } from "../schemas";
import type { CreateSessionResponse, EventResponse, PublicSessionState, Timing } from "../types";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  suggest: (profile: Profile, scenarioId: ScenarioId, existing: string[]) =>
    post<{ suggestions: { claim: string; why: string }[] }>("/api/suggest", { profile, scenarioId, existing }),
  gap: (profile: Profile, alias: string, claims: string[]) =>
    post<{ gap: GapResult }>("/api/gap", { profile, alias, claims }),
  createSession: (profile: Profile, setup: Setup, gap?: GapResult | null) =>
    post<CreateSessionResponse>("/api/session", { profile, setup, gap: gap ?? undefined }),
  event: (id: string, role: "user" | "agent", text: string, timing: Timing) =>
    post<EventResponse>(`/api/session/${id}/event`, { role, text, timing }),
  end: (id: string, reason: "timeout" | "npc_ended" | "left" | "error", tSec: number) =>
    post<{ state: PublicSessionState }>(`/api/session/${id}/end`, { reason, tSec }),
  debrief: (id: string) => post<{ state: PublicSessionState }>(`/api/session/${id}/debrief`, {}),
};
