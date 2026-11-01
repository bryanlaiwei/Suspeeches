"use client";

import { ProfileSchema, type Profile } from "../schemas";
import { loadProfile, saveProfile } from "./storage";
import { supabase } from "./supabase";

/** The signed-in player's saved profile (falls back to this browser's copy). */
export async function fetchProfile(): Promise<Profile | null> {
  const sb = supabase();
  if (sb) {
    const { data: auth } = await sb.auth.getUser();
    if (auth.user) {
      const { data } = await sb.from("profiles").select("data").eq("user_id", auth.user.id).maybeSingle();
      const parsed = ProfileSchema.safeParse(data?.data);
      if (parsed.success) {
        saveProfile(parsed.data);
        return parsed.data;
      }
    }
  }
  return loadProfile();
}

export async function storeProfile(profile: Profile): Promise<void> {
  saveProfile(profile);
  const sb = supabase();
  if (!sb) return;
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return;
  const { error } = await sb
    .from("profiles")
    .upsert({ user_id: auth.user.id, data: profile, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Couldn't save your profile: ${error.message}`);
}
