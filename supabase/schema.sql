-- Suspeeches database: player profiles, finished games and (optionally) live sessions.
--
-- Run once in a new Supabase project (SQL editor, or `psql "$DATABASE_URL" -f supabase/schema.sql`).
-- It is idempotent, so re-running it is safe.
--
-- Security model: the browser only ever talks to Postgres with the publishable key plus the
-- signed-in player's access token, so these row-level-security policies are the only thing keeping
-- one player's data from another. Every policy is scoped to auth.uid(). Players can edit their own
-- profile but only read their games: the server writes games, and live sessions, with
-- SUPABASE_SECRET_KEY (which bypasses RLS), so nobody can write a score into their own history.
-- That key stays on the server.

-- ---------- profiles: the real profile the hidden judge sees (src/lib/client/profileStore.ts) ----------

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- ProfileSchema in src/lib/schemas.ts: name, role, skills, yearsExperience, education, facts.
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- games: one row per finished scene (saveGame in src/lib/supabase-server.ts) ----------

create table if not exists public.games (
  -- The session id, so the debrief link /debrief?id=<id> works after the live session is gone.
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  scenario_id     text not null,
  scenario_name   text not null,
  alias           text not null,
  outcome         text not null check (outcome in ('survived', 'caught')),
  end_reason      text not null check (end_reason in ('caught', 'timeout', 'npc_ended', 'left', 'error')),
  score           integer not null,
  final_suspicion integer not null check (final_suspicion between 0 and 100),
  larp_gap        integer not null check (larp_gap between 0 and 100),
  duration_sec    integer not null check (duration_sec >= 0),
  -- The full PublicSessionState (transcript, events, debrief) for the debrief page.
  state           jsonb not null,
  created_at      timestamptz not null default now()
);

-- History list: the player's games, newest first (src/components/GameHistory.tsx).
create index if not exists games_user_created_idx on public.games (user_id, created_at desc);

-- Which prompts and models each game ran on (GameVersions in src/lib/types.ts), pulled out of
-- `state` so you can compare games before and after a prompt or model change, e.g.
--   select judge_prompt, judge_model, avg(final_suspicion), avg(score), count(*)
--   from games group by 1, 2 order by max(created_at) desc;
-- Generated from `state`, so the app never writes them and older games just have nulls.
alter table public.games add column if not exists judge_model  text generated always as (state #>> '{versions,judge,model}') stored;
alter table public.games add column if not exists judge_prompt text generated always as (state #>> '{versions,judge,prompt}') stored;
alter table public.games add column if not exists npc_prompt   text generated always as (state #>> '{versions,npc,prompt}') stored;
create index if not exists games_judge_prompt_idx on public.games (judge_prompt);

alter table public.games enable row level security;

drop policy if exists "games: read own" on public.games;
create policy "games: read own" on public.games
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Read-only for players. Only the server saves games (saveGame, with the secret key), so a player
-- can't insert or edit a row to put any score they like in their history. Earlier versions of this
-- file let players insert and update their own rows; re-running it removes those policies.
drop policy if exists "games: insert own" on public.games;
drop policy if exists "games: update own" on public.games;

-- No delete policies: players can't remove rows through the API (deleting the account cascades).

-- ---------- game_sessions: live sessions (src/lib/sessionStore.ts) ----------
--
-- Used whenever SUPABASE_SECRET_KEY is set (which accounts need). Without the key, the server keeps
-- live sessions in memory and never touches this table. With it, every live scene is a row here, so
-- a restart or deploy doesn't drop calls in progress, any instance can serve any request, and the
-- after-the-call debrief job (src/lib/debrief.ts) can be retried.
--
-- Only the server reads or writes it, with the secret key (which bypasses row-level security).
-- RLS is on with no policies, so the publishable key and players' own tokens can't reach it: a
-- player must not be able to edit their own live suspicion.

create table if not exists public.game_sessions (
  id               uuid primary key,
  user_id          uuid references auth.users (id) on delete cascade,
  -- live, caught, survived or left (copied from state for queries).
  status           text not null,
  -- The whole Session object (src/lib/sessions.ts).
  state            jsonb not null,
  -- Compare-and-swap: every write is "update ... where version = <the version I read>".
  version          integer not null,
  -- The after-the-call job, copied from state.job so stuck or failed jobs can be queried.
  job_status       text not null default 'none' check (job_status in ('none', 'pending', 'running', 'done', 'failed')),
  job_attempts     integer not null default 0,
  job_error        text,
  job_locked_until timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Jobs that still need running (e.g. for a sweeper: pending, failed, or running with an expired lock).
create index if not exists game_sessions_job_idx on public.game_sessions (job_status, job_locked_until)
  where job_status in ('pending', 'running', 'failed');

alter table public.game_sessions enable row level security;
-- Deliberately no policies.

-- Finished games are copied to public.games, so old rows can go. To clean up weekly, for example:
--   delete from public.game_sessions where updated_at < now() - interval '7 days';

-- ---------- table privileges ----------
--
-- Spelled out rather than left to the project's defaults (which differ between Supabase projects),
-- so the API can do exactly what the policies above allow and nothing more. Logged-out visitors
-- (anon) get nothing; players read and write their profile and read their games; only the server
-- (service_role, i.e. the secret key) touches game_sessions and writes games.
revoke all on public.profiles, public.games, public.game_sessions from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.games to authenticated;
grant all on public.profiles, public.games, public.game_sessions to service_role;
