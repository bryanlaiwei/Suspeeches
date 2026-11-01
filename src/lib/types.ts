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
  tSec: number;
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

/** Shape the client receives for live updates. */
export interface PublicSessionState {
  id: string;
  status: SessionStatus;
  endReason: EndReason | null;
  suspicion: number;
  events: SuspicionEvent[];
  claims: ClaimState[];
  transcript: Turn[];
  setup: Setup;
  gap: GapResult;
  scenarioName: string;
  startedAt: number;
  durationSec: number | null;
  debrief: Debrief | null;
  handler: { enabled: boolean; address: string | null; briefSent: boolean; debriefSent: boolean; error: string | null };
}

export interface EventResponse {
  state: PublicSessionState;
  /** Present when this event was a judged user turn. */
  judged?: { event: SuspicionEvent; nextProbe: string; npcHint: string } | null;
  /** Tone change for the NPC when suspicion crossed a mood band (contextual update text). */
  npcMood?: string | null;
}

export interface SilenceResponse {
  state: PublicSessionState;
  /** Null when the report was early, duplicate, or the scene is over. */
  event: SuspicionEvent | null;
  npcMood: string | null;
}

export type VoiceConnection =
  | { mode: "elevenlabs"; conversationToken: string; dynamicVariables: Record<string, string>; overrides?: NpcOverrides }
  | { mode: "mock"; firstMessage: string; lines: string[] };

/** Only the custom agent uses overrides (voice); everything else goes through dynamic variables. */
export interface NpcOverrides {
  tts: { voiceId: string };
}

export interface CreateSessionResponse {
  state: PublicSessionState;
  voice: VoiceConnection;
}
