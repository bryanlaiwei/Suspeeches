"use client";

import { useConversation } from "@elevenlabs/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { playCaught, playRelief, playSpike, playSurvived, unlockAudio } from "@/lib/client/sound";
import type { SetupDraft } from "@/lib/client/storage";
import { castFor, presetFor, type CastMember } from "@/lib/presets";
import { parseSegments } from "@/lib/voiceTags";
import { SetupSchema, type Profile, type Setup } from "@/lib/schemas";
import { SILENCE_FIRST_SEC, SILENCE_REPEAT_SEC, SPIKE_DELTA, START_SUSPICION } from "@/lib/scoring";
import type { EndReason, PublicSessionState, SuspicionEvent, VoiceConnection } from "@/lib/types";
import { CallStage, EndOverlay, MockInput } from "./CallScreen";
import { fmtTime } from "@/lib/context";
import { Avatar } from "./Avatar";
import { Button, Card, cx, ERROR_NOTE, FictionNote, Shell } from "./ui";
import type { LiveLine } from "./Transcript";
import { useAnimatedNumber } from "./useAnimatedNumber";

type Phase = "briefing" | "connecting" | "live" | "ended" | "error";

const VAD_SPEECH = 0.6;
const INPUT_SPEECH = 0.08;

export function SceneRunner({ profile, draft }: { profile: Profile; draft: SetupDraft }) {
  const router = useRouter();
  const setup = useMemo(() => SetupSchema.parse(draft) as Setup, [draft]);
  const cast = useMemo(() => castFor(setup), [setup]);
  const isGroup = cast.length > 1;
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("briefing");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [voice, setVoice] = useState<VoiceConnection | null>(null);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [remaining, setRemaining] = useState(setup.timeLimitSec);
  const [lastDelta, setLastDelta] = useState<{ delta: number; key: number; by?: Record<string, number> } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [ending, setEnding] = useState<EndReason | null>(null);
  const [userTalking, setUserTalking] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [silentFor, setSilentFor] = useState(0);
  const [busted, setBusted] = useState(false);

  const suspicion = useAnimatedNumber(state?.suspicion ?? START_SUSPICION, 5);

  // Mutable engine state lives in refs so SDK callbacks never see stale values.
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef<number>(0);
  const agentStoppedAt = useRef<number | null>(null);
  const userSpeechStart = useRef<number | null>(null);
  const endingRef = useRef(false);
  /** Caught: the NPC is delivering its goodbye before hanging up. */
  const bustedRef = useRef<{ agentSpoke: boolean; prompted: boolean; fallback: ReturnType<typeof setTimeout> } | null>(null);
  const lineId = useRef(0);
  const voiceRef = useRef<VoiceConnection | null>(null);
  const mock = useRef({ level: 0, speaking: false, lineIdx: 0 });
  const npcSpeaking = useRef(false);
  /** Next silence report we owe the server for the current silent stretch. */
  const silenceDue = useRef<{ since: number; strikes: number } | null>(null);
  /** Who is talking: segments of the current agent response (by spoken length) and chars played so far. */
  const speech = useRef<{
    buffer: string;
    segments: { name: string; len: number }[];
    spoken: number;
    active: string | null;
    timers: ReturnType<typeof setTimeout>[];
  }>({ buffer: "", segments: [], spoken: 0, active: null, timers: [] });

  const elapsed = () => (startedAt.current ? (performance.now() - startedAt.current) / 1000 : 0);

  const conversation = useConversation({
    onConnect: () => beginLive(),
    onDisconnect: (details) => {
      if (endingRef.current) return;
      if (bustedRef.current) void finish("caught");
      else if (details.reason === "agent") void finish("npc_ended");
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
      npcSpeaking.current = mode === "speaking";
      // Fallback until playback timings arrive (and for 1-on-1 scenes).
      if (mode === "speaking" && !speech.current.active) setActive(speech.current.segments[0]?.name ?? cast[0].name);
      if (mode === "listening") {
        // Keep the segment map (playback can pause mid-response); just drop pending face switches.
        speech.current.timers.forEach(clearTimeout);
        speech.current.timers = [];
        setActive(null);
        // eslint-disable-next-line react-hooks/purity -- SDK event callback, not render
        agentStoppedAt.current = performance.now();
        userSpeechStart.current = null;
        // The NPC finished its goodbye line: the app hangs up (NPCs can't end calls).
        if (bustedRef.current?.agentSpoke) setTimeout(() => void finish("caught"), 700);
        else if (bustedRef.current) promptGoodbye();
      }
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore > VAD_SPEECH) markUserSpeaking();
    },
    // Raw LLM text streams in before the audio, tags included: map out who says what.
    onAgentChatResponsePart: ({ text, type }) => {
      const sp = speech.current;
      if (type === "start") resetSpeech();
      else if (type === "delta") sp.buffer += text;
      sp.segments = speakerSegments(sp.buffer);
    },
    // Fires when each audio chunk STARTS PLAYING (WebSocket transport) with per-character timings:
    // switch faces exactly at the character where the next speaker's part begins.
    onAudioAlignmentPlayback: ({ alignment }) => {
      const sp = speech.current;
      const startTimes = alignment.char_start_times_ms;
      let prev: string | null = null;
      alignment.chars.forEach((_, i) => {
        const who = speakerAt(sp.spoken + i);
        if (who && who !== prev) {
          prev = who;
          const delay = startTimes[i] ?? 0;
          if (delay <= 0) setActive(who);
          else sp.timers.push(setTimeout(() => setActive(who), delay));
        }
      });
      sp.spoken += alignment.chars.length;
    },
    onInterruption: () => {
      resetSpeech();
      setActive(null);
    },
  });

  function resetSpeech() {
    const sp = speech.current;
    sp.timers.forEach(clearTimeout);
    Object.assign(sp, { buffer: "", segments: [], spoken: 0, timers: [] });
  }

  /** Which character is speaking at a given character offset of the current response. */
  function speakerAt(offset: number): string | null {
    let acc = 0;
    for (const seg of speech.current.segments) {
      acc += seg.len;
      if (offset < acc) return seg.name;
    }
    return speech.current.segments.at(-1)?.name ?? null;
  }

  /** Names for each tagged part of an agent response (untagged text belongs to the previous speaker). */
  function speakerSegments(text: string) {
    let current = cast[0].name;
    return parseSegments(text).map((s) => {
      if (s.label) current = cast.find((c) => c.label === s.label || c.name === s.label)?.name ?? current;
      return { name: current, text: s.text, len: s.text.length + 1 };
    });
  }

  function setActive(name: string | null) {
    if (speech.current.active === name) return;
    speech.current.active = name;
    setActiveSpeaker(name);
  }

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
    // Only the reply to the goodbye nudge counts as the goodbye (not a line already in flight).
    if (bustedRef.current?.prompted) bustedRef.current.agentSpoke = true;
    // One transcript line per character (group responses contain several voice tags).
    for (const seg of speakerSegments(text)) {
      const speaker = isGroup ? seg.name : undefined;
      pushLine({ role: "agent", text: seg.text, tSec, speaker });
      void api.event(sessionId.current, "agent", seg.text, { responseLatencyMs: null, speechMs: null, tSec }, speaker).catch(() => {});
    }
  }

  function onUserLine(text: string) {
    // Once caught, nothing the player says counts (including the nudge that triggers the goodbye).
    if (!sessionId.current || endingRef.current || bustedRef.current) return;
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
        const breakdown = judged.event.perCharacter?.map((p) => ({ name: p.name, delta: p.delta }));
        setLines((ls) =>
          ls.map((l) => (l.id === id ? { ...l, delta: judged.event.delta, turnIndex: judged.event.turnIndex, breakdown } : l)),
        );
        react(judged.event);
        if (res.state.status === "caught") return bust(res.npcMood);
        tellNpc(res.npcMood);
        tellNpc(judged.npcHint);
      })
      .catch((e) => {
        setLines((ls) => ls.map((l) => (l.id === id ? { ...l, delta: undefined } : l)));
        console.error("judge request failed", e);
      });

    if (voiceRef.current?.mode === "mock") mockReply();
  }

  /**
   * Suspicion hit 100. The NPC gets a "you've decided, end it" note, says a cold goodbye and hangs up
   * after their goodbye line; if no goodbye arrives within 15 s we hang up anyway.
   */
  function bust(note: string | null | undefined) {
    if (bustedRef.current || endingRef.current) return;
    if (voiceRef.current?.mode !== "elevenlabs" || !note) return void finish("caught");
    playCaught();
    setBusted(true);
    bustedRef.current = { agentSpoke: false, prompted: false, fallback: setTimeout(() => void finish("caught"), 8_000) };
    conversation.sendContextualUpdate(note);
    // A contextual note never makes the NPC talk, so nudge a reply now (or once it finishes its current line).
    if (!npcSpeaking.current) promptGoodbye();
  }

  /** Make the NPC answer right away; with the decision note in context, that answer is its goodbye. */
  function promptGoodbye() {
    const b = bustedRef.current;
    if (!b || b.prompted || endingRef.current) return;
    b.prompted = true;
    try {
      conversation.sendUserMessage("Okay.");
    } catch {
      void finish("caught");
    }
  }

  /** Contextual update to the NPC (mood or next-question hint). Never triggers a reply. */
  function tellNpc(text: string | null | undefined) {
    if (text && voiceRef.current?.mode === "elevenlabs" && !endingRef.current) conversation.sendContextualUpdate(text);
  }

  /** Called every tick: penalise silence on the player's turn (the server has the final say). */
  function checkSilence() {
    if (bustedRef.current) return setSilentFor(0);
    const stopped = agentStoppedAt.current;
    const speaking = voiceRef.current?.mode === "mock" ? mock.current.speaking : npcSpeaking.current;
    if (stopped === null || speaking || userSpeechStart.current !== null || !startedAt.current) {
      silenceDue.current = null;
      setSilentFor(0);
      return;
    }
    const since = (stopped - startedAt.current) / 1000;
    const quiet = elapsed() - since;
    setSilentFor(quiet);
    if (!silenceDue.current || silenceDue.current.since !== since) silenceDue.current = { since, strikes: 0 };
    const due = SILENCE_FIRST_SEC + silenceDue.current.strikes * SILENCE_REPEAT_SEC;
    if (quiet < due || !sessionId.current) return;
    silenceDue.current.strikes++;
    void api
      .silence(sessionId.current, since, elapsed())
      .then((res) => {
        if (!res.event || endingRef.current) return;
        setState(res.state);
        pushLine({ role: "system", text: `${res.event.quote} +${res.event.delta}`, tSec: res.event.tSec, turnIndex: res.event.turnIndex });
        react(res.event);
        if (res.state.status === "caught") return bust(res.npcMood);
        tellNpc(res.npcMood);
      })
      .catch((e) => console.error("silence report failed", e));
  }

  function react(e: SuspicionEvent) {
    setLastDelta({
      delta: e.delta,
      key: e.turnIndex,
      by: e.perCharacter ? Object.fromEntries(e.perCharacter.map((p) => [p.name, p.delta])) : undefined,
    });
    if (e.kind === "silence") {
      playSpike(0.35);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } else if (e.delta >= SPIKE_DELTA) {
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
    if (bustedRef.current) clearTimeout(bustedRef.current.fallback);
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
    if (reason === "caught" && !bustedRef.current) playCaught();
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
        const common = {
          dynamicVariables: res.voice.dynamicVariables,
          ...(res.voice.overrides ? { overrides: res.voice.overrides } : {}),
        };
        if (res.voice.signedUrl)
          conversation.startSession({ signedUrl: res.voice.signedUrl, connectionType: "websocket", stripAudioTags: true, ...common });
        else conversation.startSession({ conversationToken: res.voice.conversationToken!, connectionType: "webrtc", ...common });
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
    const segments = speakerSegments(text);
    mock.current.speaking = true;
    const done = () => {
      mock.current.speaking = false;
      setActive(null);
      agentStoppedAt.current = performance.now();
    };
    // Speak each character's part in turn, lighting up whoever is talking.
    const next = (i: number) => {
      const seg = segments[i];
      if (!seg || endingRef.current) return done();
      setActive(seg.name);
      if (!synth) return void setTimeout(() => next(i + 1), 400 + seg.text.length * 45);
      const u = new SpeechSynthesisUtterance(seg.text);
      u.rate = 1.05;
      u.pitch = 0.8 + (cast.findIndex((c) => c.name === seg.name) % 3) * 0.25;
      u.onend = () => next(i + 1);
      u.onerror = () => next(i + 1);
      synth.speak(u);
    };
    next(0);
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
      else checkSilence();
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


  const getLevel = useCallback((name: string) => {
    // Only whoever is talking moves their mouth (1-on-1: the single NPC).
    if (isGroup && speech.current.active !== name) return 0;
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
  }, [conversation, isGroup]);

  /* ---------- render ---------- */

  const npcTalking = voice?.mode === "elevenlabs" ? conversation.isSpeaking : !!activeSpeaker;
  const silenceWarning = phase === "live" && !busted && silentFor >= SILENCE_FIRST_SEC - 3;

  // Only the latest line from each side is shown (no conversation history on screen).
  const lastUser = [...lines].reverse().find((l) => l.role === "user") ?? null;
  const lastAgentAt = [...lines].reverse().find((l) => l.role === "agent")?.tSec;
  const agentBurst = lines.filter((l) => l.role === "agent" && l.tSec === lastAgentAt);
  const npcShown = agentBurst.find((l) => l.speaker && l.speaker === activeSpeaker) ?? agentBurst.at(-1) ?? null;
  const youSpeaking = userTalking && !npcTalking;
  const userLatest = !!lastUser && (!npcShown || lastUser.id > npcShown.id);
  const caption = youSpeaking
    ? { speaker: "You", text: "…", you: true }
    : userLatest && lastUser
      ? { speaker: "You", text: lastUser.text, you: true }
      : npcShown
        ? { speaker: npcShown.speaker || cast[0].name, text: npcShown.text, you: false }
        : null;
  const sceneLabel = presetFor(setup.scenarioId).label;
  const callTitle = isGroup ? sceneLabel : `${sceneLabel} · ${cast[0].name}`;

  if (phase === "briefing" || (phase === "error" && !hasSession)) {
    return (
      <Shell step={2}>
        <Briefing setup={setup} cast={cast} gap={draft.gap!} onStart={start} onBack={() => router.push("/setup")} error={error} />
      </Shell>
    );
  }

  const status: { text: string; tone: "warn" | "red" | "soft" } | null =
    phase === "connecting"
      ? { text: `Calling ${isGroup ? "the panel" : cast[0].name}…`, tone: "soft" }
      : busted && phase === "live"
        ? { text: `Busted. ${state?.caughtBy ?? cast[0].name} is wrapping up…`, tone: "red" }
        : silenceWarning
          ? {
              text: `${isGroup ? "They're" : `${cast[0].name} is`} waiting… ${Math.max(0, Math.ceil(nextSilenceAt(silentFor) - silentFor))}s`,
              tone: "warn",
            }
          : error && phase !== "ended"
            ? { text: error, tone: "red" }
            : null;

  return (
    <>
      <CallStage
        title={callTitle}
        you={setup.alias}
        cast={cast}
        suspicion={suspicion}
        suspicionBy={state?.suspicionBy ?? null}
        active={npcTalking ? (isGroup ? activeSpeaker : cast[0].name) : null}
        caption={caption}
        userTalking={youSpeaking}
        remaining={remaining}
        pop={lastDelta}
        getLevel={getLevel}
        shaking={shaking}
        status={status}
        muted={voice?.mode === "elevenlabs" ? conversation.isMuted : null}
        onMute={() => conversation.setMuted(!conversation.isMuted)}
        onHangUp={() => void finish("left")}
        mockInput={
          voice?.mode === "mock" && phase === "live" ? <MockInput onSend={(t) => onUserLine(t)} onTyping={markUserSpeaking} /> : null
        }
      />
      {phase === "ended" && ending && <EndOverlay reason={ending} npcName={state?.caughtBy ?? cast[0].name} />}
    </>
  );
}

/** Seconds of silence at which the next penalty lands. */
function nextSilenceAt(quiet: number): number {
  if (quiet < SILENCE_FIRST_SEC) return SILENCE_FIRST_SEC;
  return SILENCE_FIRST_SEC + Math.ceil((quiet - SILENCE_FIRST_SEC + 0.001) / SILENCE_REPEAT_SEC) * SILENCE_REPEAT_SEC;
}

function Briefing({
  setup,
  cast,
  gap,
  onStart,
  onBack,
  error,
}: {
  setup: Setup;
  cast: CastMember[];
  gap: NonNullable<SetupDraft["gap"]>;
  onStart: () => void;
  onBack: () => void;
  error: string | null;
}) {
  const npcName = cast.length > 1 ? `${cast.slice(0, -1).map((c) => c.name).join(", ")} & ${cast.at(-1)!.name}` : cast[0].name;
  return (
    <div className="mx-auto grid w-full max-w-4xl items-center gap-8 pt-6 md:grid-cols-[1fr_1.2fr]">
      <div className={cx("mx-auto flex justify-center", cast.length > 1 ? "-space-x-6" : "")}>
        {cast.map((c, i) => (
          <Avatar key={i} palette={c} suspicion={START_SUSPICION} getLevel={() => 0} className={cast.length > 1 ? "w-36" : "w-64"} />
        ))}
      </div>
      <Card>
        <p className="text-xs font-black tracking-[0.25em] text-red">BRIEFING</p>
        <h1 className="mt-1 text-3xl font-black">You&apos;re about to meet {npcName}.</h1>
        <p className="mt-2 font-bold text-muted">
          You are <strong className="text-ink">{setup.alias}</strong>. {npcName} only knows this:
        </p>
        <ul className="mt-3 space-y-2 font-bold">
          {setup.claims.map((c) => (
            <li key={c} className="rounded-2xl bg-lav px-4 py-2.5">
              {c}
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs font-black uppercase tracking-widest text-muted">
          <div className="rounded-2xl bg-lav p-3">
            <dt>Goal</dt>
            <dd className="mt-1 text-[12px] font-bold normal-case tracking-normal text-ink">{setup.goal}</dd>
          </div>
          <div className="rounded-2xl bg-lav p-3">
            <dt>Clock</dt>
            <dd className="mt-1 text-2xl font-black text-ink">{fmtTime(setup.timeLimitSec)}</dd>
          </div>
          <div className="rounded-2xl bg-lav p-3">
            <dt>Larp gap</dt>
            <dd className="mt-1 text-2xl font-black text-ink">
              {gap.gapScore} <span className="text-xs text-purple">×{gap.multiplier.toFixed(1)}</span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm font-bold text-muted">
          {cast.length > 1
            ? "The bar over each person's head shows how suspicious they are of you. The call ends when anyone hits 100% (you're caught) or the clock runs out (you made it)."
            : `The bar over ${cast[0].name}'s head shows how suspicious they are of you. The call ends when it hits 100% (you're caught) or the clock runs out (you made it).`}
        </p>
        {error && <p className={cx(ERROR_NOTE, "mt-3")}>{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            ← Edit cover
          </Button>
          <Button className="flex-1" onClick={onStart}>
            🎙️ Start talking
          </Button>
        </div>
        <FictionNote className="mt-4" />
      </Card>
    </div>
  );
}
