import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PublicSessionState } from "./types";

/**
 * Accounts are Supabase Auth (email + password). The browser keeps the session and sends its access
 * token as a Bearer header; the server verifies it and uses it for row-level-secured writes.
 */
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function authEnabled(): boolean {
  return !!url() && !!key();
}

export interface Owner {
  userId: string;
  email: string | null;
  /** The user's access token, used to save the game under their account (RLS). */
  token: string;
}

function userClient(token: string): SupabaseClient {
  return createClient(url(), key(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the signed-in user. When Supabase isn't configured (local dev), everyone is anonymous. */
export async function requireUser(
  req: Request,
): Promise<{ ok: true; owner: Owner | null } | { ok: false; res: Response }> {
  if (!authEnabled()) return { ok: true, owner: null };
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const unauthorized = (error: string) => ({ ok: false as const, res: Response.json({ error }, { status: 401 }) });
  if (!token) return unauthorized("Sign in first.");
  const { data, error } = await userClient(token).auth.getUser(token);
  if (error || !data.user) return unauthorized("Your session expired. Sign in again.");
  return { ok: true, owner: { userId: data.user.id, email: data.user.email ?? null, token } };
}

/** Save a finished game to the player's history. Never throws: history is nice-to-have. */
export async function saveGame(owner: Owner, state: PublicSessionState): Promise<void> {
  const d = state.debrief;
  if (!d) return;
  const { error } = await userClient(owner.token)
    .from("games")
    .upsert({
      id: state.id,
      user_id: owner.userId,
      scenario_id: state.setup.scenarioId,
      scenario_name: state.scenarioName,
      alias: state.setup.alias,
      outcome: d.outcome,
      end_reason: d.endReason,
      score: d.score,
      final_suspicion: d.finalSuspicion,
      larp_gap: d.larpGap,
      duration_sec: d.durationSec,
      state,
    });
  if (error) console.error("[history] could not save game:", error.message);
}
