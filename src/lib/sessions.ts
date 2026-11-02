import { randomUUID } from "node:crypto";
import { characterName } from "./context";
import { judgeTurn, npcHintFor } from "./judge";
import type { GapResult, JudgeResult, Profile, Setup, Timing } from "./schemas";
import { groupMoodNote, moodNote } from "./mood";
import { castFor } from "./presets";
import {
  appliedDelta,
  applyDelta,
  CAUGHT_AT,
  cutShort,
  moodFor,
  silencePenalty,
  SILENCE_FIRST_SEC,
  SILENCE_REPEAT_SEC,
  START_SUSPICION,
  type Mood,
  type ScoreHistory,
} from "./scoring";
import { sessionStore, type StoredSession } from "./sessionStore";
import type { SessionOwner } from "./supabase-server";
import { deliverySignals } from "./timing";
import { gameVersions } from "./versions";
import type {
  CharacterReaction,
  ClaimState,
  Debrief,
  DebriefJobStatus,
  EndReason,
  EventResponse,
  GameVersions,
  PublicSessionState,
  SessionStatus,
  SilenceResponse,
  SuspicionEvent,
  Turn,
} from "./types";

/** The debrief that's written after the call (debrief.ts). Retried until done. */
export interface DebriefJob {
  status: DebriefJobStatus;
  attempts: number;
  error: string | null;
  /** While running: when another worker may take over (the one running it probably died). */
  lockedUntil: number | null;
}

/**
 * One scene. Plain data only, so it can be stored (sessionStore.ts) and any server instance can
 * pick it up. Everything that affects the score is decided here, never taken from the browser:
 * the real profile and larp gap are fixed at creation, and time runs on the server's clock.
 */
export interface Session {
  id: string;
  createdAt: number;
  profile: Profile;
  setup: Setup;
  gap: GapResult;
  suspicion: number;
  status: SessionStatus;
  endReason: EndReason | null;
  /** Server time (ms) the voice call connected. The scene clock starts here, not at creation. */
  connectedAt: number | null;
  durationSec: number | null;
  transcript: Turn[];
  events: SuspicionEvent[];
  claims: ClaimState[];
  debrief: Debrief | null;
  /** Signed-in player (null when accounts are off); the finished game is saved to their history. */
  owner: SessionOwner | null;
  /** Tone the NPC was last told to use. */
  mood: Mood;
  /** Group scenes: each character's suspicion and mood (null for 1-on-1). */
  suspicionBy: Record<string, number> | null;
  moodBy: Record<string, Mood> | null;
  /** Group scenes: the character whose bar hit 100. */
  caughtBy: string | null;
  /** Current silence on the player's turn: when it started (browser clock) and how many penalties it has cost. */
  silence: { sinceSec: number; strikes: number } | null;
  silenceCount: number;
  job: DebriefJob;
  /** Prompt hashes and models this game ran on. */
  versions: GameVersions;
}

/** What a session operation returns to its route: the response, and whether it just ended the scene. */
export interface Outcome<T> {
  response: T;
  ended: boolean;
}

/* ---------- the clock ---------- */

/** A browser "timeout" this close to the limit still counts: its clock starts a moment before ours. */
export const TIMEOUT_TOLERANCE_SEC = 3;
/** Lines still arriving this long past the limit mean the call ran out on our clock: end it. */
export const LATE_GRACE_SEC = 10;

/** Seconds since the call connected, by the server's clock (0 before it connects). */
export function sceneSec(s: Session, now = Date.now()): number {
  return s.connectedAt === null ? 0 : Math.max(0, Math.round((now - s.connectedAt) / 100) / 10);
}

/** End a live scene whose time ran out more than `grace` seconds ago. True if it ended now. */
function enforceClock(s: Session, now: number, grace = LATE_GRACE_SEC): boolean {
  if (s.status !== "live" || s.connectedAt === null) return false;
  if (sceneSec(s, now) < s.setup.timeLimitSec + grace) return false;
  finish(s, "timeout", s.setup.timeLimitSec);
  return true;
}

/* ---------- storage ---------- */

/** Returned by a mutation that changed nothing, so nothing is written. */
export class Unchanged<T> {
  constructor(readonly value: T) {}
}
export const unchanged = <T>(value: T) => new Unchanged(value);

/**
 * Load, change and save a session. `fn` must be synchronous and may run more than once: if another
 * request saved in between, the write is rejected (version check) and `fn` runs again on fresh state.
 * Slow work (model calls) happens outside, between two updates.
 *
 * `known` is a copy the caller already holds (from its previous update): it skips the read, and if
 * it turns out to be stale the version check catches it and the loop reads fresh state.
 */
export async function updateSession<T>(
  id: string,
  fn: (s: Session, now: number) => T | Unchanged<T>,
  known?: StoredSession,
): Promise<{ s: Session; value: T; version: number } | null> {
  const store = sessionStore();
  let rec = known ? { session: structuredClone(known.session), version: known.version } : await store.get(id);
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!rec) return null;
    const out = fn(rec.session, Date.now());
    if (out instanceof Unchanged) return { s: rec.session, value: out.value, version: rec.version };
    const version = await store.update(rec.session, rec.version);
    if (version !== null) return { s: rec.session, value: out, version };
    rec = await store.get(id);
  }
  throw new Error("This session is busy. Try again.");
}

export async function loadSession(id: string): Promise<Session | null> {
  return (await sessionStore().get(id))?.session ?? null;
}

/**
 * Judge calls for one session run one at a time in this process, so suspicion moves in turn order
 * and each call sees the claim statuses the previous one left. (Across instances the version check
 * still prevents lost updates; overlapping turns then apply in the order their judges finish.)
 */
const g = globalThis as unknown as { __susQueues?: Map<string, Promise<unknown>> };
const queues: Map<string, Promise<unknown>> = (g.__susQueues ??= new Map());

function enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
  const job = (queues.get(id) ?? Promise.resolve()).then(task);
  const tail = job.catch(() => undefined);
  queues.set(id, tail);
  void tail.then(() => queues.get(id) === tail && queues.delete(id));
  return job;
}

/* ---------- lifecycle ---------- */

export function newSession(profile: Profile, setup: Setup, gap: GapResult, owner: SessionOwner | null): Session {
  return {
    id: randomUUID(),
    createdAt: Date.now(),
    profile,
    setup,
    gap,
    suspicion: START_SUSPICION,
    status: "live",
    endReason: null,
    connectedAt: null,
    durationSec: null,
    transcript: [],
    events: [],
    claims: setup.claims.map((claim) => ({ claim, status: "untested" })),
    debrief: null,
    owner: owner && { userId: owner.userId, email: owner.email },
    mood: moodFor(START_SUSPICION),
    ...groupState(setup),
    caughtBy: null,
    silence: null,
    silenceCount: 0,
    job: { status: "none", attempts: 0, error: null, lockedUntil: null },
    versions: gameVersions(setup),
  };
}

export async function createSession(
  profile: Profile,
  setup: Setup,
  gap: GapResult,
  owner: SessionOwner | null,
): Promise<Session> {
  const s = newSession(profile, setup, gap, owner);
  await sessionStore().insert(s);
  return s;
}

/** The voice call connected: start the scene clock (idempotent). */
export async function markConnected(id: string): Promise<PublicSessionState | null> {
  const r = await updateSession(id, (s, now) => {
    if (s.status !== "live" || s.connectedAt !== null) return unchanged(null);
    s.connectedAt = now;
    return null;
  });
  return r && toPublic(r.s);
}

type Judged = { judged: EventResponse["judged"]; npcMood: string | null; ended: boolean };

/** Append a transcript line. User lines are judged (one at a time per session). */
export async function addEvent(
  id: string,
  role: "user" | "agent",
  text: string,
  timing: Timing,
  seq: number,
  speaker?: string,
): Promise<Outcome<EventResponse> | null> {
  const added = await updateSession(id, (s, now) => {
    if (s.status !== "live") return unchanged({ turn: null, ended: false });
    s.connectedAt ??= now; // the connect report never arrived: the first line starts the clock
    if (enforceClock(s, now)) return { turn: null, ended: true };
    const turn: Turn & { seq: number } = {
      index: 0,
      seq,
      role,
      text,
      tSec: sceneSec(s, now),
      ...(role === "agent" && speaker ? { speaker } : {}),
    };
    if (role === "user") {
      turn.signals = deliverySignals(text, timing);
      s.silence = null; // they spoke, so any silence streak is over
    }
    if (!insertTurn(s, turn)) return unchanged({ turn: null, ended: false }); // a retried request
    return { turn: turn as Turn | null, ended: false };
  });
  if (!added) return null;
  const { turn, ended } = added.value;
  if (!turn || turn.role === "agent") return { response: { state: toPublic(added.s), judged: null }, ended };

  // Nothing queued ahead of this turn: the state we just saved is current, so the judge can start from it.
  const known = queues.has(id) ? undefined : { session: added.s, version: added.version };
  const judged = await enqueue(id, () => judgeAndApply(id, seq, known));
  if (!judged) return { response: { state: toPublic(added.s), judged: null }, ended: false };
  return {
    response: { state: toPublic(judged.s), judged: judged.value.judged, npcMood: judged.value.npcMood },
    ended: judged.value.ended,
  };
}

/** Judge one user line (found by seq, since its index can shift) and apply the result to the latest state. */
async function judgeAndApply(id: string, seq: number, known?: StoredSession): Promise<{ s: Session; value: Judged } | null> {
  const none: Judged = { judged: null, npcMood: null, ended: false };
  const rec = known ?? (await sessionStore().get(id));
  if (!rec) return null;
  const before = rec.session;
  const turn = before.transcript.find((t) => t.seq === seq);
  if (before.status !== "live" || !turn?.signals) return { s: before, value: none };

  const { result, degraded } = await judgeTurn({
    profile: before.profile,
    setup: before.setup,
    transcript: before.transcript,
    turn: { ...turn, signals: turn.signals },
    previousClaims: before.claims,
    userTurnNumber: before.transcript.filter((t) => t.role === "user" && t.index <= turn.index).length,
  });

  return updateSession<Judged>(
    id,
    (s) => {
      // The scene may have ended while the judge was thinking.
      const at = s.transcript.find((t) => t.seq === seq);
      if (s.status !== "live" || !at) return unchanged(none);
      const event = applyJudgement(s, at, result, degraded);
      return {
        judged: { event, nextProbe: result.next_probe, npcHint: npcHintFor(result.next_probe) },
        npcMood: npcNote(s),
        ended: s.status !== "live",
      };
    },
    rec,
  );
}

function applyJudgement(s: Session, turn: Turn, result: JudgeResult, degraded: boolean): SuspicionEvent {
  // Contradicted claims never recover, even if this turn's judge started before an earlier one finished.
  s.claims = result.claims_status.map((c, i) => (s.claims[i]?.status === "contradicted" ? { ...c, status: "contradicted" } : c));
  let delta: number;
  let notes: string[] = [];
  let perCharacter: CharacterReaction[] | undefined;
  if (s.suspicionBy) {
    // Group: each listener has their own bar, scored on what they can actually judge.
    perCharacter = result.listeners.map((l) => {
      const applied = appliedDelta(l.delta, s.gap.gapScore, scoreHistory(s, l.name));
      return { name: l.name, judgeDelta: l.delta, reason: l.reason, adjustments: applied.notes, ...applyTo(s, l.name, applied.delta) };
    });
    delta = biggestMove(perCharacter);
  } else {
    ({ delta, notes } = appliedDelta(result.delta, s.gap.gapScore, scoreHistory(s)));
    s.suspicion = applyDelta(s.suspicion, delta);
  }
  const event: SuspicionEvent = {
    kind: "turn",
    turnIndex: turn.index,
    tSec: turn.tSec,
    delta,
    judgeDelta: result.delta,
    adjustments: notes,
    perCharacter,
    suspicion: s.suspicion,
    reasons: result.reasons,
    categories: result.categories,
    quote: turn.text.length > 160 ? `${turn.text.slice(0, 157)}...` : turn.text,
    degraded,
  };
  s.events.push(event);
  if (s.suspicion >= CAUGHT_AT) caught(s, turn.tSec);
  return event;
}

/**
 * Lines come in over separate requests and can race, so the transcript is kept in the order the
 * browser heard them (seq). A late line is slotted in and everything after it renumbered, including
 * judged events, which point at their user turn by index. Returns false for a seq already recorded.
 */
function insertTurn(s: Session, turn: Turn & { seq: number }): boolean {
  const t = s.transcript;
  if (t.some((x) => x.seq === turn.seq)) return false;
  let at = t.length;
  while (at > 0 && (t[at - 1].seq ?? -1) > turn.seq) at--;
  // tSec is when the request reached us; keep times in spoken order around a late line.
  turn.tSec = Math.min(Math.max(turn.tSec, t[at - 1]?.tSec ?? 0), t[at]?.tSec ?? Infinity);
  t.splice(at, 0, turn);
  for (let i = at; i < t.length; i++) t[i].index = i;
  if (at < t.length - 1) for (const e of s.events) if (e.kind === "turn" && e.turnIndex >= at) e.turnIndex++;
  return true;
}

/**
 * The player has said nothing since their turn started. The browser reports it (only it hears the
 * audio); the server decides whether a penalty is due (first after SILENCE_FIRST_SEC, then every
 * SILENCE_REPEAT_SEC). Both times are the browser's, used only to tell one silence from the next.
 */
export async function addSilence(id: string, silentSinceSec: number, tSec: number): Promise<Outcome<SilenceResponse> | null> {
  type Result = { event: SuspicionEvent | null; npcMood: string | null; ended: boolean };
  const none: Result = { event: null, npcMood: null, ended: false };
  const r = await updateSession<Result>(id, (s, now) => {
    if (s.status !== "live") return unchanged(none);
    if (enforceClock(s, now)) return { ...none, ended: true };
    if (!s.silence || Math.abs(s.silence.sinceSec - silentSinceSec) > 0.5) s.silence = { sinceSec: silentSinceSec, strikes: 0 };

    const due = s.silence.sinceSec + SILENCE_FIRST_SEC + s.silence.strikes * SILENCE_REPEAT_SEC;
    if (tSec + 0.5 < due) return unchanged(none); // too early or a duplicate report

    const silentFor = Math.round(tSec - s.silence.sinceSec);
    const delta = silencePenalty(s.silence.strikes);
    s.silence.strikes++;
    s.silenceCount++;
    // Everyone notices silence.
    const perCharacter = s.suspicionBy ? Object.keys(s.suspicionBy).map((name) => ({ name, ...applyTo(s, name, delta) })) : undefined;
    if (!perCharacter) s.suspicion = applyDelta(s.suspicion, delta);
    const event: SuspicionEvent = {
      kind: "silence",
      turnIndex: -s.silenceCount,
      tSec: sceneSec(s, now),
      delta,
      perCharacter,
      suspicion: s.suspicion,
      reasons: [`You went quiet for ${silentFor} seconds when it was your turn.`],
      categories: { consistency: 5, specificity: 0, plausibility: 5, delivery: 0 },
      quote: `(${silentFor} s of silence)`,
    };
    s.events.push(event);
    if (s.suspicion >= CAUGHT_AT) caught(s, event.tSec);
    return { event, npcMood: npcNote(s), ended: s.status !== "live" };
  });
  if (!r) return null;
  return { response: { state: toPublic(r.s), event: r.value.event, npcMood: r.value.npcMood }, ended: r.value.ended };
}

/** End the scene (idempotent). Waits for this process's in-flight judging so the final state is consistent. */
export async function endSession(
  id: string,
  reason: Exclude<EndReason, "caught">,
): Promise<Outcome<{ state: PublicSessionState }> | null> {
  await (queues.get(id) ?? Promise.resolve());
  const r = await updateSession(id, (s, now) => {
    if (s.status !== "live") return unchanged(false);
    const elapsed = sceneSec(s, now);
    // Don't take the browser's word for a timeout: the limit must have passed on our clock, which
    // starts when the call connected. Earlier than that, they left.
    const realTimeout = s.connectedAt !== null && elapsed + TIMEOUT_TOLERANCE_SEC >= s.setup.timeLimitSec;
    finish(s, reason === "timeout" && !realTimeout ? "left" : reason, Math.min(elapsed, s.setup.timeLimitSec));
    return true;
  });
  return r && { response: { state: toPublic(r.s) }, ended: r.value };
}

/**
 * A live scene whose time is up on our clock with no one left to end it (the tab closed, or the
 * browser's end request was lost). It ran the full clock, so it ends as a timeout.
 */
export async function settleExpired(id: string): Promise<Outcome<Session> | null> {
  const r = await updateSession(id, (s, now) => (enforceClock(s, now, 0) ? true : unchanged(false)));
  return r && { response: r.s, ended: r.value };
}

/* ---------- scoring helpers ---------- */

/** Recent scoring history for streaks and redemption (silence penalties count as bad turns). */
function scoreHistory(s: Session, character?: string): ScoreHistory {
  // For a group character, their own past deltas; otherwise the overall ones.
  const deltas = s.events.map((e) => (character ? (e.perCharacter?.find((p) => p.name === character)?.delta ?? 0) : e.delta));
  const streak = (bad: boolean) => {
    let n = 0;
    for (let i = deltas.length - 1; i >= 0 && (bad ? deltas[i] > 0 : deltas[i] < 0); i--) n++;
    return n;
  };
  return { lastDelta: deltas.at(-1) ?? null, badStreak: streak(true), goodStreak: streak(false) };
}

/** Group scenes start everyone at the same suspicion. */
function groupState(setup: Setup): Pick<Session, "suspicionBy" | "moodBy"> {
  const cast = castFor(setup);
  if (cast.length < 2) return { suspicionBy: null, moodBy: null };
  return {
    suspicionBy: Object.fromEntries(cast.map((c) => [c.name, START_SUSPICION])),
    moodBy: Object.fromEntries(cast.map((c) => [c.name, moodFor(START_SUSPICION)])),
  };
}

/** Apply a change to one character's bar; the overall bar is the most suspicious character. */
function applyTo(s: Session, name: string, delta: number): { delta: number; suspicion: number } {
  const by = s.suspicionBy!;
  by[name] = applyDelta(by[name] ?? START_SUSPICION, delta);
  s.suspicion = Math.max(...Object.values(by));
  return { delta, suspicion: by[name] };
}

/** The headline move for a group turn: whichever character's bar moved the most. */
function biggestMove(per: CharacterReaction[]): number {
  return per.reduce((best, p) => (Math.abs(p.delta) > Math.abs(best) ? p.delta : best), 0);
}

/** One bar at 100 is enough: whoever is most certain ends the scene. */
function caught(s: Session, tSec: number) {
  if (s.suspicionBy) {
    s.caughtBy = Object.entries(s.suspicionBy).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  finish(s, "caught", tSec);
}

/** Note for the NPC after a suspicion change: "say goodbye" when caught, a new mood, or nothing. */
function npcNote(s: Session): string | null {
  if (s.status === "caught") return (s.caughtBy ? groupMoodNote({ caughtBy: s.caughtBy }) : moodNote("caught")) || null;
  return moodChange(s);
}

/** Contextual-update text when suspicion moved the NPC into a new mood band, else null. */
function moodChange(s: Session): string | null {
  if (s.status !== "live") return null;
  if (s.suspicionBy && s.moodBy) {
    const next = Object.fromEntries(Object.entries(s.suspicionBy).map(([n, v]) => [n, moodFor(v)])) as Record<string, Mood>;
    if (Object.entries(next).every(([n, m]) => s.moodBy![n] === m)) return null;
    s.moodBy = next;
    return groupMoodNote({ moods: next }) || null;
  }
  const mood = moodFor(s.suspicion);
  if (mood === s.mood) return null;
  s.mood = mood;
  return moodNote(mood) || null;
}

function finish(s: Session, reason: EndReason, tSec: number) {
  s.endReason = reason;
  s.durationSec = Math.round(tSec);
  if (reason === "caught") s.status = "caught";
  else if (cutShort(reason)) s.status = "left";
  else s.status = "survived";
  s.silence = null;
  // The debrief runs as a job after the response (debrief.ts); the route schedules it.
  s.job = { status: "pending", attempts: 0, error: null, lockedUntil: null };
}

export function toPublic(s: Session): PublicSessionState {
  return {
    id: s.id,
    status: s.status,
    endReason: s.endReason,
    suspicion: s.suspicion,
    suspicionBy: s.suspicionBy,
    caughtBy: s.caughtBy,
    events: s.events,
    claims: s.claims,
    transcript: s.transcript,
    setup: s.setup,
    gap: s.gap,
    scenarioName: characterName(s.setup),
    startedAt: s.connectedAt ?? s.createdAt,
    durationSec: s.durationSec,
    debrief: s.debrief,
    job: { status: s.job.status, error: s.job.error },
    versions: s.versions,
  };
}
