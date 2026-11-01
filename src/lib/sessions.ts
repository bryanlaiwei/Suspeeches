import { randomUUID } from "node:crypto";
import { characterName } from "./context";
import { judgeTurn, npcHintFor } from "./judge";
import type { GapResult, Profile, Setup, Timing } from "./schemas";
import { applyDelta, CAUGHT_AT, START_SUSPICION } from "./scoring";
import { deliverySignals } from "./timing";
import type {
  ClaimState,
  Debrief,
  EndReason,
  EventResponse,
  PublicSessionState,
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

    s.suspicion = applyDelta(s.suspicion, result.delta);
    s.claims = result.claims_status;
    const event: SuspicionEvent = {
      turnIndex: userTurn.index,
      tSec: userTurn.tSec,
      delta: result.delta,
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
  return { state: toPublic(s), judged };
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
