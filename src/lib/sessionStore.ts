import type { Session } from "./sessions";
import { adminClient } from "./supabase-server";

/**
 * Where live sessions are kept between requests.
 *
 * - Memory (default): one Map in this server process. A restart or deploy drops live calls,
 *   and more than one instance can't share sessions.
 * - Supabase (when SUPABASE_SECRET_KEY is set): the game_sessions table in supabase/schema.sql.
 *   Any instance can serve any request, and a restart loses nothing, including unfinished debriefs.
 *
 * Writes are compare-and-swap on a version number, so two requests touching the same session (a
 * judged turn and a silence penalty, say) can't overwrite each other: the loser reloads and retries.
 */
export interface StoredSession {
  session: Session;
  version: number;
}

export interface SessionStore {
  readonly durable: boolean;
  insert(s: Session): Promise<void>;
  get(id: string): Promise<StoredSession | null>;
  /** Write `s` if it's still at `version`. Returns the new version, or null if someone wrote first. */
  update(s: Session, version: number): Promise<number | null>;
}

const TTL_MS = 6 * 60 * 60 * 1000;

export class MemoryStore implements SessionStore {
  readonly durable = false;
  private rows = new Map<string, StoredSession>();

  async insert(s: Session) {
    const now = Date.now();
    for (const [id, r] of this.rows) if (now - r.session.createdAt > TTL_MS) this.rows.delete(id);
    this.rows.set(s.id, { session: structuredClone(s), version: 1 });
  }

  async get(id: string) {
    const r = this.rows.get(id);
    // Copies in and out, so callers can't change stored state without update(), same as a database.
    return r ? { session: structuredClone(r.session), version: r.version } : null;
  }

  async update(s: Session, version: number) {
    const r = this.rows.get(s.id);
    if (!r || r.version !== version) return null;
    this.rows.set(s.id, { session: structuredClone(s), version: version + 1 });
    return version + 1;
  }
}

const TABLE = "game_sessions";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The columns besides `state` are copies kept for queries (whose session, which jobs are stuck). */
function row(s: Session, version: number) {
  return {
    id: s.id,
    user_id: s.owner?.userId ?? null,
    status: s.status,
    state: s,
    version,
    job_status: s.job.status,
    job_attempts: s.job.attempts,
    job_error: s.job.error,
    job_locked_until: s.job.lockedUntil ? new Date(s.job.lockedUntil).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

export class SupabaseStore implements SessionStore {
  readonly durable = true;
  constructor(private db = adminClient()!) {}

  async insert(s: Session) {
    const { error } = await this.db.from(TABLE).insert(row(s, 1));
    if (error) throw new Error(`Couldn't save the session: ${error.message}`);
  }

  async get(id: string) {
    // Session IDs are UUIDs; anything else can't exist, and Postgres would reject it with an error.
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db.from(TABLE).select("state, version").eq("id", id).maybeSingle();
    if (error) throw new Error(`Couldn't load the session: ${error.message}`);
    return data ? { session: data.state as Session, version: data.version as number } : null;
  }

  async update(s: Session, version: number) {
    const { data, error } = await this.db
      .from(TABLE)
      .update(row(s, version + 1))
      .eq("id", s.id)
      .eq("version", version)
      .select("version");
    if (error) throw new Error(`Couldn't save the session: ${error.message}`);
    return data.length ? version + 1 : null;
  }
}

const g = globalThis as unknown as { __susStore?: SessionStore };

/** Supabase when the secret key is set, else memory. Survives dev hot reloads via globalThis. */
export function sessionStore(): SessionStore {
  return (g.__susStore ??= adminClient() ? new SupabaseStore() : new MemoryStore());
}

/** Tests swap in their own store. */
export function setSessionStore(store: SessionStore | undefined) {
  g.__susStore = store;
}
