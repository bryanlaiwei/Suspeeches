import { randomUUID } from "node:crypto";
import { characterName } from "./context";
import { startDebrief } from "./debrief";
import type { Owner } from "./supabase-server";
import { judgeTurn, npcHintFor } from "./judge";
import type { GapResult, Profile, Setup, Timing } from "./schemas";
import { groupMoodNote, moodNote } from "./mood";
import { castFor } from "./presets";
import {
  appliedDelta,
  applyDelta,
  CAUGHT_AT,
  moodFor,
  silencePenalty,
  SILENCE_FIRST_SEC,
  SILENCE_REPEAT_SEC,
  START_SUSPICION,
  type Mood,
  type ScoreHistory,
} from "./scoring";
import { deliverySignals } from "./timing";
import type {
  CharacterReaction,
  ClaimState,
  Debrief,
  EndReason,
  EventResponse,
  PublicSessionState,
  SilenceResponse,
  SessionStatus,
  SuspicionEvent,
  Turn,
} from "./types";

export interface Session {
  id: string;
  createdAt: number;
  profile: Profile;
  setup: Setup;
  gap: GapResult;
  suspicion: number;
  status: SessionStatus;
  endReason: EndReason | null;
  startedAt: number;
  durationSec: number | null;
  transcript: Turn[];
  events: SuspicionEvent[];
  claims: ClaimState[];
  debrief: Debrief | null;
  debriefPromise: Promise<Debrief> | null;
  handler: PublicSessionState["handler"];
  /** Public origin of the app, for links in emails. */
  appUrl: string;
  /** Signed-in player (null when accounts are off); the finished game is saved to their history. */
  owner: Owner | null;
  /** Serializes judge calls so suspicion updates apply in turn order. */
  queue: Promise<unknown>;
  /** Tone the NPC was last told to use. */
  mood: Mood;
  /** Group scenes: each character's suspicion and mood (null for 1-on-1). */
  suspicionBy: Record<string, number> | null;
  moodBy: Record<string, Mood> | null;
  /** Group scenes: the character whose bar hit 100. */
  caughtBy: string | null;
  /** Current silence on the player's turn: when it started and how many penalties it has cost. */
  silence: { sinceSec: number; strikes: number } | null;
  silenceCount: number;
}

// In-memory store. Survives hot reloads in dev via globalThis; resets on server restart (by design).
const g = globalThis as unknown as { __susSessions?: Map<string, Session> };
const sessions: Map<string, Session> = (g.__susSessions ??= new Map());
const TTL_MS = 6 * 60 * 60 * 1000;

export function createSession(profile: Profile, setup: Setup, gap: GapResult, appUrl: string, owner: Owner | null): Session {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > TTL_MS) sessions.delete(id);

  const s: Session = {
    id: randomUUID(),
    createdAt: now,
    profile,
    setup,
    gap,
    suspicion: START_SUSPICION,
    status: "live",
    endReason: null,
    startedAt: now,
    durationSec: null,
    transcript: [],
    events: [],
    claims: setup.claims.map((claim) => ({ claim, status: "untested" })),
    debrief: null,
    debriefPromise: null,
    handler: { enabled: false, address: null, briefSent: false, debriefSent: false, error: null },
    appUrl,
    owner,
    queue: Promise.resolve(),
    mood: moodFor(START_SUSPICION),
    ...groupState(setup),
    caughtBy: null,
    silence: null,
    silenceCount: 0,
  };
  sessions.set(s.id, s);
  return s;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

/** Append a transcript event. User turns are judged (serialized per session). */
export async function addEvent(
  s: Session,
  role: "user" | "agent",
  text: string,
  timing: Timing,
  speaker?: string,
): Promise<EventResponse> {
  if (s.status !== "live") return { state: toPublic(s), judged: null };

  const turn: Turn = { index: s.transcript.length, role, text, tSec: timing.tSec, ...(role === "agent" && speaker ? { speaker } : {}) };
  if (role === "agent") {
    s.transcript.push(turn);
    return { state: toPublic(s), judged: null };
  }

  s.silence = null; // they spoke, so any silence streak is over
  const signals = deliverySignals(text, timing);
  const userTurn = { ...turn, signals };
  s.transcript.push(userTurn);
  const userTurnNumber = s.transcript.filter((t) => t.role === "user").length;

  const job = s.queue.then(async () => {
    if (s.status !== "live") return null;
    const { result, degraded } = await judgeTurn({
      profile: s.profile,
      setup: s.setup,
      transcript: s.transcript,
      turn: userTurn,
      previousClaims: s.claims,
      userTurnNumber,
    });
    // The scene may have ended while the judge was thinking.
    if (s.status !== "live") return null;

    s.claims = result.claims_status;
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
      turnIndex: userTurn.index,
      tSec: userTurn.tSec,
      delta,
      judgeDelta: result.delta,
      adjustments: notes,
      perCharacter,
      suspicion: s.suspicion,
      reasons: result.reasons,
      categories: result.categories,
      quote: text.length > 160 ? `${text.slice(0, 157)}...` : text,
      degraded,
    };
    s.events.push(event);
    if (s.suspicion >= CAUGHT_AT) caught(s, userTurn.tSec);
    return { event, nextProbe: result.next_probe, npcHint: npcHintFor(result.next_probe) };
  });
  s.queue = job.catch(() => undefined);
  const judged = await job;
  return { state: toPublic(s), judged, npcMood: judged ? npcNote(s) : null };
}

/**
 * The player has said nothing since their turn started. The browser reports it; the server decides
 * whether a penalty is due (first after SILENCE_FIRST_SEC, then every SILENCE_REPEAT_SEC).
 */
export async function addSilence(s: Session, silentSinceSec: number, tSec: number): Promise<SilenceResponse> {
  const none = (): SilenceResponse => ({ state: toPublic(s), event: null, npcMood: null });
  if (s.status !== "live") return none();
  if (!s.silence || Math.abs(s.silence.sinceSec - silentSinceSec) > 0.5) s.silence = { sinceSec: silentSinceSec, strikes: 0 };

  const due = s.silence.sinceSec + SILENCE_FIRST_SEC + s.silence.strikes * SILENCE_REPEAT_SEC;
  if (tSec + 0.5 < due) return none(); // too early or a duplicate report

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
    tSec,
    delta,
    perCharacter,
    suspicion: s.suspicion,
    reasons: [`You went quiet for ${silentFor} seconds when it was your turn.`],
    categories: { consistency: 5, specificity: 0, plausibility: 5, delivery: 0 },
    quote: `(${silentFor} s of silence)`,
  };
  s.events.push(event);
  if (s.suspicion >= CAUGHT_AT) caught(s, tSec);
  return { state: toPublic(s), event, npcMood: npcNote(s) };
}

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

/** Note for the NPC after a suspicion change: "end the call" when caught, a new mood, or nothing. */
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

/** End the scene (idempotent). Waits for in-flight judging so the final state is consistent. */
export async function endSession(s: Session, reason: Exclude<EndReason, "caught">, tSec: number): Promise<void> {
  await s.queue;
  if (s.status !== "live") return;
  finish(s, reason, tSec);
}

function finish(s: Session, reason: EndReason, tSec: number) {
  s.endReason = reason;
  s.durationSec = Math.round(tSec);
  if (reason === "caught") s.status = "caught";
  else if (reason === "left" || reason === "error") s.status = "left";
  else s.status = "survived";
  // Write (and email) the debrief right away; the debrief page just waits on the same promise.
  startDebrief(s).catch((err) => console.error("[debrief]", err instanceof Error ? err.message : err));
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
    startedAt: s.startedAt,
    durationSec: s.durationSec,
    debrief: s.debrief,
    handler: s.handler,
  };
}
