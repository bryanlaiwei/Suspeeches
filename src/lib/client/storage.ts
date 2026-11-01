"use client";

import type { GapResult, Profile, Setup } from "../schemas";
import type { CreateSessionResponse } from "../types";

const PROFILE_KEY = "sus:profile:v1";
const READ_KEY = "sus:read-messages:v1";
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

/** The fake persona built on the "Build your cover" screen; claims are derived from it. */
export interface Cover {
  alias: string;
  title: string;
  years: string;
  projects: string[];
  skills: string[];
  goal: "interview" | "referral" | "vibe";
}

export type SetupDraft = Partial<Setup> & {
  gap?: GapResult | null;
  gapFor?: string;
  cover?: Cover;
  /** A call is waiting on Home / Messages (set on "Meet X", cleared when the call is accepted). */
  callReady?: boolean;
};
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

/** Messages the player has opened (ids), for unread badges. */
export const loadReadIds = () => new Set(read<string[]>(local(), READ_KEY) ?? []);
export const markRead = (id: string) => {
  const ids = loadReadIds();
  ids.add(id);
  write(local(), READ_KEY, [...ids]);
};
