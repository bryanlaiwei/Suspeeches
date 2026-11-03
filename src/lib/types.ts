import type {
  ClaimStatus,
  GapResult,
  JudgeResult,
  Profile,
  Setup,
  Timing,
} from "./schemas";

export type { ClaimStatus, GapResult, JudgeResult, Profile, Setup, Timing };

export type SessionStatus = "live" | "caught" | "survived" | "left";
export type EndReason = "caught" | "timeout" | "npc_ended" | "left" | "error";

export interface Turn {
  index: number;
  role: "user" | "agent";
  text: string;
  /** Seconds since the call connected, by the server's clock. */
  tSec: number;
  /** Order the browser heard the line in. The transcript is sorted by it (missing on old saved games). */
  seq?: number;
  /** Which character spoke (group scenes). */
  speaker?: string;
  /** Delivery signals, user turns only. */
  signals?: DeliverySignals;
}

export interface DeliverySignals {
  words: number;
  fillerCount: number;
  fillerRate: number; // fillers per 100 words
  fillers: string[];
  responseLatencyMs: number | null;
  speechMs: number | null;
  wordsPerMinute: number | null;
  longPause: boolean;
}

export interface CharacterReaction {
  name: string;
  /** Applied change and resulting suspicion for this character. */
  delta: number;
  suspicion: number;
  judgeDelta?: number;
  reason?: string;
  adjustments?: string[];
}

/** A judged user turn or a silence penalty, as shown on the bar / timeline. */
export interface SuspicionEvent {
  kind: "turn" | "silence";
  /** Transcript index of the judged turn; negative (-1, -2, ...) for silence penalties. */
  turnIndex: number;
  tSec: number;
  /** Suspicion change actually applied (after difficulty scaling). */
  delta: number;
  /** The judge's raw delta before scaling (turn events only). */
  judgeDelta?: number;
  /** How the judge's delta became the applied one, e.g. ["×1.40 larp gap", "−10 cleared up the last doubt"]. */
  adjustments?: string[];
  /** Group scenes: each character's own reaction. Top-level delta/suspicion then describe the most alarmed one. */
  perCharacter?: CharacterReaction[];
  suspicion: number;
  reasons: string[];
  categories: JudgeResult["categories"];
  /** Text of the user turn (or a silence description), for the timeline popover. */
  quote: string;
  /** True when the judge failed twice and we fell back to a neutral result. */
  degraded?: boolean;
}

export interface ClaimState {
  claim: string;
  status: ClaimStatus;
}

export interface Debrief {
  outcome: "survived" | "caught";
  endReason: EndReason;
  finalSuspicion: number;
  /** Group scenes: each character's final suspicion. */
  finalByCharacter?: Record<string, number>;
  /** Group scenes: who caught the player, if anyone. */
  caughtBy?: string;
  averageSuspicion: number;
  headline: string;
  spikes: { turnIndex: number; tSec: number; delta: number; suspicion: number; reason: string }[];
  claims: { claim: string; verdict: "held" | "shaky" | "blown" | "untested"; note: string }[];
  tips: string[];
  larpGap: number; // 0..100
  gapMultiplier: number;
  score: number;
  scoreBreakdown: { survival: number; gapMultiplier: number; lowSuspicionBonus: number };
  durationSec: number;
}

/** The prompt files (content hashes) and models a game ran on. */
export interface GameVersions {
  judge: { model: string; prompt: string };
  gap: { model: string; prompt: string };
  summarizer: { model: string; prompt: string };
  /** Character sheet + shared rules + mood notes. The voice LLM lives on the ElevenLabs agent. */
  npc: { prompt: string };
}

/** Shape the client receives for live updates. */
export interface PublicSessionState {
  id: string;
  status: SessionStatus;
  endReason: EndReason | null;
  /** Overall suspicion: in group scenes, the most suspicious character's bar. */
  suspicion: number;
  /** Group scenes: each character's bar (null for 1-on-1). */
  suspicionBy: Record<string, number> | null;
  /** Group scenes: the character whose bar hit 100. */
  caughtBy: string | null;
  events: SuspicionEvent[];
  claims: ClaimState[];
  transcript: Turn[];
  setup: Setup;
  gap: GapResult;
  scenarioName: string;
  /** When the call connected (server clock, ms), or when the session was created if it never did. */
  startedAt: number;
  durationSec: number | null;
  debrief: Debrief | null;
  /** The after-the-call job that writes the debrief and saves the game. */
  job: { status: DebriefJobStatus; error: string | null };
  /** Optional: games saved before versions were recorded don't have it. */
  versions?: GameVersions;
}

/** none: still live · pending: queued · running · done · failed: will be retried. */
export type DebriefJobStatus = "none" | "pending" | "running" | "done" | "failed";

export interface EventResponse {
  state: PublicSessionState;
  /** Present when this event was a judged user turn. */
  judged?: { event: SuspicionEvent; nextProbe: string; npcHint: string } | null;
  /** Tone change for the NPC when suspicion crossed a mood band (contextual update text). */
  npcMood?: string | null;
}

/** A judged turn's score, sent ahead of the judge's notes. The event's reasons are still empty. */
export interface ScoreResponse {
  state: PublicSessionState;
  event: SuspicionEvent;
  npcMood: string | null;
}

/**
 * The event route's response body: one JSON object per line. A judged user line gets a `score`
 * line as soon as the judge has scored it, then every request ends with `done` (or `error`).
 */
export type EventStreamLine = { score: ScoreResponse } | { done: EventResponse } | { error: string };

export interface SilenceResponse {
  state: PublicSessionState;
  /** Null when the report was early, duplicate, or the scene is over. */
  event: SuspicionEvent | null;
  npcMood: string | null;
}

export type VoiceConnection =
  | {
      mode: "elevenlabs";
      /** WebRTC token (1-on-1 scenes) or WebSocket signed URL (group scenes, which need playback timing). */
      conversationToken?: string;
      signedUrl?: string;
      overrides: NpcOverrides;
    }
  | { mode: "mock"; firstMessage: string; lines: string[] };

/** ElevenLabs session overrides: the character's prompt and first message, and (custom agent only) the voice. */
export interface NpcOverrides {
  agent: { prompt: { prompt: string }; firstMessage: string };
  tts?: { voiceId: string };
}

export interface CreateSessionResponse {
  state: PublicSessionState;
  voice: VoiceConnection;
}
