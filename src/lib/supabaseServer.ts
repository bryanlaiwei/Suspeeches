import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ProfileSchema, type Profile } from "./schemas";
import type { PublicSessionState } from "./types";

/**
 * Accounts are Supabase Auth (email + password). The browser keeps the session and sends its access
 * token as a Bearer header; the server verifies it.
 *
 * SUPABASE_SECRET_KEY is server-only and needed with accounts: only the server writes finished games
 * (players can read their history but not write it, so they can't invent scores), and it also keeps
 * live sessions in Postgres (sessionStore.ts). It bypasses row-level security, so it must never
 * reach the browser (no NEXT_PUBLIC_ prefix).
 */
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = () => process.env.SUPABASE_SECRET_KEY ?? "";

export function authEnabled(): boolean {
  return !!url() && !!key();
}

/** The signed-in player as a session remembers them (no token, since sessions can be stored). */
export interface SessionOwner {
  userId: string;
  email: string | null;
}

export interface Owner extends SessionOwner {
  /** The user's access token, for row-level-secured reads on their behalf. */
  token: string;
}

function userClient(token: string): SupabaseClient {
  return createClient(url(), key(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let admin: SupabaseClient | null = null;
/** Server-only client with the secret key, or null when it isn't configured. */
export function adminClient(): SupabaseClient | null {
  if (!url() || !secretKey()) return null;
  admin ??= createClient(url(), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** The raw Bearer token on a request, unverified (requireUser checks it). */
function bearerToken(req: Request): string | undefined {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || undefined;
}

/** Resolve the signed-in user. When Supabase isn't configured (local dev), everyone is anonymous. */
export async function requireUser(
  req: Request,
): Promise<{ ok: true; owner: Owner | null } | { ok: false; res: Response }> {
  if (!authEnabled()) return { ok: true, owner: null };
  const token = bearerToken(req) ?? "";
  const unauthorized = (error: string) => ({ ok: false as const, res: Response.json({ error }, { status: 401 }) });
  if (!token) return unauthorized("Sign in first.");
  const { data, error } = await userClient(token).auth.getUser(token);
  if (error || !data.user) return unauthorized("Your session expired. Sign in again.");
  return { ok: true, owner: { userId: data.user.id, email: data.user.email ?? null, token } };
}

/** Only the player who started a game may read or retry it (games without an owner are open). */
export async function requireOwner(
  req: Request,
  owner: SessionOwner | null,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  if (!owner || !authEnabled()) return { ok: true };
  const auth = await requireUser(req);
  if (!auth.ok) return auth;
  if (auth.owner?.userId !== owner.userId) return { ok: false, res: Response.json({ error: "Not your game." }, { status: 403 }) };
  return { ok: true };
}

/** The player's saved real profile, read on the server. The judge never takes it from the browser. */
export async function loadProfile(owner: Owner): Promise<Profile | null> {
  const db = adminClient() ?? userClient(owner.token);
  const { data, error } = await db.from("profiles").select("data").eq("user_id", owner.userId).maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  const parsed = ProfileSchema.safeParse(data?.data);
  return parsed.success ? parsed.data : null;
}

/**
 * The real profile a request may use: the saved one for a signed-in player. The request's own copy
 * is only used when accounts are off (local dev, no one to look up).
 */
export async function trustedProfile(
  owner: Owner | null,
  fromBody: Profile | undefined,
): Promise<{ ok: true; profile: Profile } | { ok: false; res: Response }> {
  const fail = (error: string) => ({ ok: false as const, res: Response.json({ error }, { status: 400 }) });
  if (!owner) return fromBody ? { ok: true, profile: fromBody } : fail("Profile is required.");
  const saved = await loadProfile(owner);
  if (!saved) return fail("Save your real profile first.");
  return { ok: true, profile: saved };
}

/**
 * Save a finished game to the player's history. Only the server writes games, with the secret key:
 * the games table lets players read their own rows, never write them. Never throws: history is
 * nice-to-have.
 */
export async function saveGame(owner: SessionOwner, state: PublicSessionState): Promise<void> {
  const d = state.debrief;
  if (!d) return;
  const db = adminClient();
  if (!db) {
    console.error("[history] could not save game: SUPABASE_SECRET_KEY is not set");
    return;
  }
  const { error } = await db.from("games").upsert({
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
