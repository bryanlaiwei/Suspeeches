"use client";

import { useConversation } from "@elevenlabs/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "@/lib/context";
import { api } from "@/lib/client/api";
import { playCaught, playRelief, playSpike, playSurvived, unlockAudio } from "@/lib/client/sound";
import type { SetupDraft } from "@/lib/client/storage";
import { CUSTOM_PRESET, presetFor } from "@/lib/presets";
import { SetupSchema, type Profile, type Setup } from "@/lib/schemas";
import { SPIKE_DELTA } from "@/lib/scoring";
import type { ClaimState, EndReason, PublicSessionState, SuspicionEvent, VoiceConnection } from "@/lib/types";
import { Avatar, type AvatarPalette } from "./Avatar";
import { EventDetail, SuspicionBar } from "./SuspicionBar";
import { Transcript, type LiveLine } from "./Transcript";
import { Button, Card, cx, FictionNote, Input, Shell } from "./ui";
import { useAnimatedNumber } from "./useAnimatedNumber";

type Phase = "briefing" | "connecting" | "live" | "ended" | "error";

const VAD_SPEECH = 0.6;
const INPUT_SPEECH = 0.08;

export function SceneRunner({ profile, draft }: { profile: Profile; draft: SetupDraft }) {
  const router = useRouter();
  const setup = useMemo(() => SetupSchema.parse(draft) as Setup, [draft]);
  const preset = setup.scenarioId === "custom" ? CUSTOM_PRESET : presetFor(setup.scenarioId);
  const npcName = setup.scenarioId === "custom" ? setup.custom?.name || "Them" : preset.character;

  const [phase, setPhase] = useState<Phase>("briefing");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [voice, setVoice] = useState<VoiceConnection | null>(null);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [remaining, setRemaining] = useState(setup.timeLimitSec);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastDelta, setLastDelta] = useState<{ delta: number; key: number } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [ending, setEnding] = useState<EndReason | null>(null);
  const [userTalking, setUserTalking] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const suspicion = useAnimatedNumber(state?.suspicion ?? 15, 5);

  // Mutable engine state lives in refs so SDK callbacks never see stale values.
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef<number>(0);
  const agentStoppedAt = useRef<number | null>(null);
  const userSpeechStart = useRef<number | null>(null);
  const endingRef = useRef(false);
  const lineId = useRef(0);
  const voiceRef = useRef<VoiceConnection | null>(null);
  const mock = useRef({ level: 0, speaking: false, lineIdx: 0 });

  const elapsed = () => (startedAt.current ? (performance.now() - startedAt.current) / 1000 : 0);

  const conversation = useConversation({
    onConnect: () => beginLive(),
    onDisconnect: (details) => {
      if (endingRef.current) return;
      if (details.reason === "agent") void finish("npc_ended");
      else if (details.reason === "error") {
        setError(`Voice connection dropped: ${details.message}`);
        void finish("error");
      }
    },
    onError: (message) => setError(`Voice error: ${message}`),
    onMessage: ({ message, role }) => {
      if (!message.trim()) return;
      if (role === "agent") onAgentLine(message);
      else onUserLine(message);
    },
    onModeChange: ({ mode }) => {
      if (mode === "listening") {
        agentStoppedAt.current = performance.now();
        userSpeechStart.current = null;
      }
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore > VAD_SPEECH) markUserSpeaking();
    },
  });

  /* ---------- engine ---------- */

  function beginLive() {
    startedAt.current = performance.now();
    agentStoppedAt.current = null;
    setPhase("live");
  }

  function markUserSpeaking() {
    if (userSpeechStart.current === null) userSpeechStart.current = performance.now();
  }

  function pushLine(line: Omit<LiveLine, "id">) {
    const id = ++lineId.current;
    setLines((ls) => [...ls, { ...line, id }]);
    return id;
  }

  function onAgentLine(text: string) {
    if (!sessionId.current || endingRef.current) return;
    const tSec = elapsed();
    pushLine({ role: "agent", text, tSec });
    void api.event(sessionId.current, "agent", text, { responseLatencyMs: null, speechMs: null, tSec }).catch(() => {});
  }

  function onUserLine(text: string) {
    if (!sessionId.current || endingRef.current) return;
    // eslint-disable-next-line react-hooks/purity -- SDK event callback, not render
    const now = performance.now();
    const tSec = elapsed();
    const speechStart = userSpeechStart.current;
    const stopped = agentStoppedAt.current;
    const responseLatencyMs = stopped === null ? null : Math.max(0, Math.round((speechStart ?? now) - stopped));
    const speechMs = speechStart === null ? null : Math.round(now - speechStart);
    userSpeechStart.current = null;
    agentStoppedAt.current = null;

    const id = pushLine({ role: "user", text, tSec, delta: null });
    // Fire and forget: the NPC keeps talking while the judge works.
    void api
      .event(sessionId.current, "user", text, { responseLatencyMs, speechMs, tSec })
      .then((res) => {
        setState(res.state);
        const judged = res.judged;
        if (!judged) return;
        setLines((ls) => ls.map((l) => (l.id === id ? { ...l, delta: judged.event.delta, turnIndex: judged.event.turnIndex } : l)));
        react(judged.event);
        if (res.state.status === "caught") {
          void finish("caught");
          return;
        }
        if (judged.npcHint && voiceRef.current?.mode === "elevenlabs" && !endingRef.current) {
          conversation.sendContextualUpdate(judged.npcHint);
        }
      })
      .catch((e) => {
        setLines((ls) => ls.map((l) => (l.id === id ? { ...l, delta: undefined } : l)));
        console.error("judge request failed", e);
      });

    if (voiceRef.current?.mode === "mock") mockReply();
  }

  function react(e: SuspicionEvent) {
    setLastDelta({ delta: e.delta, key: e.turnIndex });
    if (e.delta >= SPIKE_DELTA) {
      playSpike(e.delta / 25);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } else if (e.delta <= -8) {
      playRelief();
    }
  }

  async function finish(reason: EndReason) {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(reason);
    setPhase("ended");
    const tSec = elapsed();
    if (voiceRef.current?.mode === "elevenlabs") {
      try {
        conversation.endSession();
      } catch {
        /* already closed */
      }
    } else {
      window.speechSynthesis?.cancel();
    }
    if (reason === "caught") playCaught();
    else if (reason !== "error") playSurvived();

    if (reason !== "caught" && sessionId.current) {
      try {
        const res = await api.end(sessionId.current, reason, tSec);
        setState(res.state);
        if (res.state.status === "caught") setEnding("caught");
      } catch (e) {
        console.error("end failed", e);
      }
    }
    setTimeout(() => sessionId.current && router.push(`/debrief?id=${sessionId.current}`), 2600);
  }

  /* ---------- start ---------- */

  async function start() {
    unlockAudio();
    setError(null);
    setPhase("connecting");
    try {
      const res = await api.createSession(profile, setup, draft.gap);
      sessionId.current = res.state.id;
      setHasSession(true);
      voiceRef.current = res.voice;
      setVoice(res.voice);
      setState(res.state);

      if (res.voice.mode === "elevenlabs") {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        conversation.startSession({
          conversationToken: res.voice.conversationToken,
          connectionType: "webrtc",
          dynamicVariables: res.voice.dynamicVariables,
          ...(res.voice.overrides ? { overrides: res.voice.overrides } : {}),
        });
      } else {
        beginLive();
        mockSpeak(res.voice.firstMessage);
      }
    } catch (e) {
      setPhase("error");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser and try again."
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
  }

  /* ---------- mock driver (MOCK_MODE dev aid) ---------- */

  function mockSpeak(text: string) {
    onAgentLine(text);
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    mock.current.speaking = true;
    const done = () => {
      mock.current.speaking = false;
      agentStoppedAt.current = performance.now();
    };
    if (!synth) {
      setTimeout(done, 400 + text.length * 45);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  }

  function mockReply() {
    const v = voiceRef.current;
    if (v?.mode !== "mock") return;
    setTimeout(() => {
      if (endingRef.current) return;
      const line = v.lines[mock.current.lineIdx % v.lines.length];
      mock.current.lineIdx++;
      mockSpeak(line);
    }, 900);
  }

  /* ---------- loops: timer + levels ---------- */

  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      const left = Math.max(0, setup.timeLimitSec - elapsed());
      setRemaining(left);
      if (left <= 0) void finish("timeout");
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== "live" || voice?.mode !== "elevenlabs") return;
    // Backup speech-start detection from mic level (in case vad_score events are off).
    let raf = 0;
    let talking = false;
    const loop = () => {
      const level = conversation.getInputVolume();
      if (level > INPUT_SPEECH) markUserSpeaking();
      const now = level > INPUT_SPEECH;
      if (now !== talking) {
        talking = now;
        setUserTalking(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voice]);

  const getLevel = useCallback(() => {
    if (voiceRef.current?.mode === "elevenlabs") {
      try {
        return conversation.getOutputVolume();
      } catch {
        return 0;
      }
    }
    // Mock: fake a talking envelope while speech synthesis runs.
    if (!mock.current.speaking) return 0;
    const t = performance.now() / 1000;
    return 0.25 + 0.2 * Math.abs(Math.sin(t * 11)) + 0.1 * Math.sin(t * 23);
  }, [conversation]);

  /* ---------- render ---------- */

  const selectedEvent = state?.events.find((e) => e.turnIndex === selected) ?? null;
  const npcSpeaking = voice?.mode === "elevenlabs" ? conversation.isSpeaking : false;
  const claims: ClaimState[] = state?.claims ?? setup.claims.map((claim) => ({ claim, status: "untested" }));

  if (phase === "briefing" || (phase === "error" && !hasSession)) {
    return (
      <Shell step={3}>
        <Briefing
          setup={setup}
          npcName={npcName}
          preset={preset}
          gap={draft.gap!}
          onStart={start}
          onBack={() => router.push("/setup")}
          error={error}
        />
      </Shell>
    );
  }

  return (
    <Shell step={3}>
      <div className="grid flex-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="relative flex flex-col items-center">
          <div className="mb-4 flex w-full items-center justify-between">
            <ClaimsHud claims={claims} />
            <div
              className={cx(
                "rounded-xl border px-4 py-2 font-mono text-2xl font-black tabular-nums",
                remaining < 30 ? "border-sus/50 text-sus" : "border-line",
              )}
              aria-label="Time remaining"
            >
              {fmtTime(remaining)}
            </div>
          </div>

          <SuspicionBar
            value={suspicion}
            events={state?.events ?? []}
            selected={selected}
            onSelect={setSelected}
            lastDelta={lastDelta}
            shaking={shaking}
          />
          {selectedEvent && (
            <div className="absolute top-36 z-20 w-full max-w-md">
              <EventDetail event={selectedEvent} onClose={() => setSelected(null)} />
            </div>
          )}
          <div className={cx("relative mt-2 w-full max-w-[300px]", shaking && "animate-sus-shake")}>
            <Avatar palette={preset} suspicion={suspicion} getLevel={getLevel} className="w-full drop-shadow-2xl" />
          </div>
          <div className="mt-1 text-center">
            <div className="text-xl font-bold">{npcName}</div>
            <div className="text-sm text-muted">{setup.scenarioId === "custom" ? "Custom character" : preset.title}</div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            {phase === "connecting" && <StatusPill tone="muted">Connecting to {npcName}…</StatusPill>}
            {phase === "live" && voice?.mode === "elevenlabs" && (
              <>
                <StatusPill tone={npcSpeaking ? "brand" : userTalking ? "clean" : "muted"}>
                  {npcSpeaking ? `${npcName} is talking` : userTalking ? "You're talking" : "Your turn. Speak up."}
                </StatusPill>
                <Button variant="ghost" onClick={() => conversation.setMuted(!conversation.isMuted)}>
                  {conversation.isMuted ? "🎙️ Unmute" : "🔇 Mute mic"}
                </Button>
              </>
            )}
            {phase === "live" && (
              <Button variant="danger" onClick={() => void finish("left")}>
                Leave scene
              </Button>
            )}
          </div>
          {error && phase !== "ended" && <p className="mt-3 text-sm text-sus">{error}</p>}
          {voice?.mode === "mock" && phase === "live" && <MockInput onSend={(t) => onUserLine(t)} />}
        </div>

        <Card className="flex max-h-[78vh] min-h-[420px] flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Live transcript</h2>
            <span className="text-xs text-muted">Tap a score to see why</span>
          </div>
          <Transcript lines={lines} npcName={npcName} onSelectTurn={setSelected} className="flex-1" />
        </Card>
      </div>

      {phase === "ended" && ending && <EndOverlay reason={ending} npcName={npcName} />}
    </Shell>
  );
}

/* ---------- pieces ---------- */

function Briefing({
  setup,
  npcName,
  preset,
  gap,
  onStart,
  onBack,
  error,
}: {
  setup: Setup;
  npcName: string;
  preset: AvatarPalette;
  gap: NonNullable<SetupDraft["gap"]>;
  onStart: () => void;
  onBack: () => void;
  error: string | null;
}) {
  return (
    <div className="mx-auto grid w-full max-w-4xl items-center gap-8 pt-6 md:grid-cols-[1fr_1.2fr]">
      <Avatar palette={preset} suspicion={15} getLevel={() => 0} className="mx-auto w-64" />
      <Card>
        <p className="text-xs font-bold tracking-[0.25em] text-sus">BRIEFING</p>
        <h1 className="mt-1 text-3xl font-black">You&apos;re about to meet {npcName}.</h1>
        <p className="mt-2 text-sm text-muted">
          You are <strong className="text-ink">{setup.alias}</strong>. {npcName} only knows this:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {setup.claims.map((c) => (
            <li key={c} className="rounded-lg bg-bg/60 px-3 py-2">
              {c}
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-muted">
          <div className="rounded-lg bg-bg/60 p-2">
            <dt>Goal</dt>
            <dd className="mt-1 text-[11px] text-ink">{setup.goal}</dd>
          </div>
          <div className="rounded-lg bg-bg/60 p-2">
            <dt>Clock</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-ink">{fmtTime(setup.timeLimitSec)}</dd>
          </div>
          <div className="rounded-lg bg-bg/60 p-2">
            <dt>Larp gap</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-ink">
              {gap.gapScore} <span className="text-xs text-brand">×{gap.multiplier.toFixed(1)}</span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">
          Use headphones so {npcName} doesn&apos;t hear themself. Suspicion hits 100 and you&apos;re caught.
        </p>
        {error && <p className="mt-3 rounded-lg bg-sus/10 px-3 py-2 text-sm text-sus">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            ← Edit cover
          </Button>
          <Button className="flex-1 py-3 text-base" onClick={onStart}>
            🎙️ Start talking
          </Button>
        </div>
        <FictionNote className="mt-4" />
      </Card>
    </div>
  );
}

const CLAIM_ICON: Record<ClaimState["status"], { icon: string; color: string; label: string }> = {
  untested: { icon: "○", color: "var(--muted)", label: "untested" },
  held: { icon: "●", color: "var(--clean)", label: "holding" },
  shaky: { icon: "◐", color: "var(--warn)", label: "shaky" },
  contradicted: { icon: "✕", color: "var(--sus)", label: "blown" },
};

function ClaimsHud({ claims }: { claims: ClaimState[] }) {
  return (
    <ul className="flex max-w-[70%] flex-wrap gap-1.5">
      {claims.map((c) => {
        const s = CLAIM_ICON[c.status];
        return (
          <li
            key={c.claim}
            title={`${c.claim}: ${s.label}`}
            className="flex max-w-[220px] items-center gap-1.5 truncate rounded-full border border-line bg-panel/80 px-2.5 py-1 text-[11px]"
          >
            <span style={{ color: s.color }}>{s.icon}</span>
            <span className="truncate text-ink/80">{c.claim}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: "brand" | "clean" | "muted" }) {
  return (
    <span
      className={cx(
        "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
        tone === "brand" && "border-brand/50 bg-brand/15",
        tone === "clean" && "border-clean/50 bg-clean/10",
        tone === "muted" && "border-line text-muted",
      )}
    >
      <span
        className={cx(
          "h-2 w-2 rounded-full",
          tone === "brand" && "animate-pulse bg-brand",
          tone === "clean" && "animate-pulse bg-clean",
          tone === "muted" && "bg-muted",
        )}
      />
      {children}
    </span>
  );
}

function MockInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-6 w-full max-w-md rounded-xl border border-dashed border-warn/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text.trim());
        setText("");
      }}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warn">
        MOCK_MODE dev input (stands in for your microphone)
      </p>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type what you'd say…" />
        <Button type="submit" variant="ghost">
          Say
        </Button>
      </div>
    </form>
  );
}

function EndOverlay({ reason, npcName }: { reason: EndReason; npcName: string }) {
  const caught = reason === "caught";
  const title = caught ? "CAUGHT" : reason === "left" ? "WALKED OUT" : reason === "error" ? "CONNECTION LOST" : "SURVIVED";
  const sub = caught
    ? `${npcName} saw right through you.`
    : reason === "npc_ended"
      ? `${npcName} wrapped it up. You made it out.`
      : reason === "timeout"
        ? "Time's up. Your cover held."
        : "Writing up your debrief…";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
      <div className="animate-sus-pop text-center">
        <div
          className="text-7xl font-black tracking-tight sm:text-8xl"
          style={{ color: caught ? "var(--sus)" : "var(--clean)", textShadow: `0 0 40px ${caught ? "#ff3b5c88" : "#2ee6a688"}` }}
        >
          {title}
        </div>
        <p className="mt-3 text-lg text-ink/80">{sub}</p>
        <p className="mt-6 text-sm text-muted">Preparing your debrief…</p>
      </div>
    </div>
  );
}
