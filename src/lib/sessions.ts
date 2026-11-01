import { randomUUID } from "node:crypto";
import { characterName } from "./context";
import { judgeTurn, npcHintFor } from "./judge";
import type { GapResult, Profile, Setup, Timing } from "./schemas";
import { moodNote } from "./mood";
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
  /** Serializes judge calls so suspicion updates apply in turn order. */
  queue: Promise<unknown>;
  /** Tone the NPC was last told to use. */
  mood: Mood;
  /** Current silence on the player's turn: when it started and how many penalties it has cost. */
  silence: { sinceSec: number; strikes: number } | null;
  silenceCount: number;
}

// In-memory store. Survives hot reloads in dev via globalThis; resets on server restart (by design).
const g = globalThis as unknown as { __susSessions?: Map<string, Session> };
const sessions: Map<string, Session> = (g.__susSessions ??= new Map());
const TTL_MS = 6 * 60 * 60 * 1000;

export function createSession(profile: Profile, setup: Setup, gap: GapResult): Session {
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
    queue: Promise.resolve(),
    mood: moodFor(START_SUSPICION),
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
): Promise<EventResponse> {
  if (s.status !== "live") return { state: toPublic(s), judged: null };

  const turn: Turn = { index: s.transcript.length, role, text, tSec: timing.tSec };
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

    const { delta, notes } = appliedDelta(result.delta, s.gap.gapScore, scoreHistory(s));
    s.suspicion = applyDelta(s.suspicion, delta);
    s.claims = result.claims_status;
    const event: SuspicionEvent = {
      kind: "turn",
      turnIndex: userTurn.index,
      tSec: userTurn.tSec,
      delta,
      judgeDelta: result.delta,
      adjustments: notes,
      suspicion: s.suspicion,
      reasons: result.reasons,
      categories: result.categories,
      quote: text.length > 160 ? `${text.slice(0, 157)}...` : text,
      degraded,
    };
    s.events.push(event);
    if (s.suspicion >= CAUGHT_AT) finish(s, "caught", userTurn.tSec);
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
  s.suspicion = applyDelta(s.suspicion, delta);
  const event: SuspicionEvent = {
    kind: "silence",
    turnIndex: -s.silenceCount,
    tSec,
    delta,
    suspicion: s.suspicion,
    reasons: [`You went quiet for ${silentFor} seconds when it was your turn.`],
    categories: { consistency: 5, specificity: 0, plausibility: 5, delivery: 0 },
    quote: `(${silentFor} s of silence)`,
  };
  s.events.push(event);
  if (s.suspicion >= CAUGHT_AT) finish(s, "caught", tSec);
  return { state: toPublic(s), event, npcMood: npcNote(s) };
}

/** Recent scoring history for streaks and redemption (silence penalties count as bad turns). */
function scoreHistory(s: Session): ScoreHistory {
  const streak = (bad: boolean) => {
    let n = 0;
    for (let i = s.events.length - 1; i >= 0 && (bad ? s.events[i].delta > 0 : s.events[i].delta < 0); i--) n++;
    return n;
  };
  return { lastDelta: s.events.at(-1)?.delta ?? null, badStreak: streak(true), goodStreak: streak(false) };
}

/** Note for the NPC after a suspicion change: "end the call" when caught, a new mood, or nothing. */
function npcNote(s: Session): string | null {
  if (s.status === "caught") return moodNote("caught") || null;
  return moodChange(s);
}

/** Contextual-update text when suspicion moved the NPC into a new mood band, else null. */
function moodChange(s: Session): string | null {
  if (s.status !== "live") return null;
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
}

export function toPublic(s: Session): PublicSessionState {
  return {
    id: s.id,
    status: s.status,
    endReason: s.endReason,
    suspicion: s.suspicion,
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
