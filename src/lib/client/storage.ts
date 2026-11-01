"use client";

import type { GapResult, Profile, Setup } from "../schemas";
import type { CreateSessionResponse } from "../types";

const PROFILE_KEY = "sus:profile:v1";
const SETUP_KEY = "sus:setup-draft:v1";
const SCENE_KEY = "sus:scene:v1";

function read<T>(store: Storage | undefined, key: string): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(store: Storage | undefined, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works for this page view */
  }
}

const local = () => (typeof window === "undefined" ? undefined : window.localStorage);
const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

export const loadProfile = () => read<Profile>(local(), PROFILE_KEY);
export const saveProfile = (p: Profile) => write(local(), PROFILE_KEY, p);

/** What a gap estimate was made for: the real profile plus the cover story. */
export function gapKeyFor(p: Profile, alias: string, claims: string[]): string {
  return JSON.stringify([p.name, p.role, p.skills, p.yearsExperience, p.education, p.facts, alias.trim(), claims]);
}

export type SetupDraft = Partial<Setup> & { gap?: GapResult | null; gapFor?: string };
export const loadSetupDraft = () => read<SetupDraft>(local(), SETUP_KEY);
export const saveSetupDraft = (d: SetupDraft) => write(local(), SETUP_KEY, d);

/** The scene handed from /setup to /scene (contains a short-lived voice token, so session-scoped). */
export const loadScene = () => read<CreateSessionResponse>(session(), SCENE_KEY);
export const saveScene = (s: CreateSessionResponse) => write(session(), SCENE_KEY, s);
export const clearScene = () => {
  try {
    session()?.removeItem(SCENE_KEY);
  } catch {
    /* ignore */
  }
};
