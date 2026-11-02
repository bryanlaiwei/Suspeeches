"use client";

import { useConversation } from "@elevenlabs/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { playCaught, playRelief, playSpike, playSurvived, unlockAudio } from "@/lib/client/sound";
import type { SetupDraft } from "@/lib/client/storage";
import { castFor, presetFor } from "@/lib/presets";
import { SetupSchema, type Profile, type Setup } from "@/lib/schemas";
import { SILENCE_FIRST_SEC, SPIKE_DELTA, START_SUSPICION } from "@/lib/scoring";
import type { EndReason, PublicSessionState, SuspicionEvent, VoiceConnection } from "@/lib/types";
import { CallStage, EndOverlay, MockInput } from "./CallScreen";
import { Briefing } from "./scene/Briefing";
import { useBustSequence } from "./scene/useBustSequence";
import { useMockDriver } from "./scene/useMockDriver";
import { nextSilenceAt, useSilenceWatcher } from "./scene/useSilenceWatcher";
import { useSpeakerTracking } from "./scene/useSpeakerTracking";
import { Shell } from "./ui";
import type { LiveLine } from "./Transcript";
import { useAnimatedNumber } from "./useAnimatedNumber";

type Phase = "briefing" | "connecting" | "live" | "ended" | "error";

const VAD_SPEECH = 0.6;
const INPUT_SPEECH = 0.08;

/**
 * Runs one scene: connects the voice agent, posts every line to the server (user lines are judged
 * while the NPC keeps talking), passes mood and next-question notes back to the NPC, and ends the
 * call on caught, timeout or hang-up. Speaker faces, silence penalties, the caught goodbye and the
 * MOCK_MODE driver are hooks in ./scene.
 */
export function SceneRunner({ profile, draft }: { profile: Profile; draft: SetupDraft }) {
  const router = useRouter();
  const setup = useMemo(() => SetupSchema.parse(draft) as Setup, [draft]);
  const cast = useMemo(() => castFor(setup), [setup]);
  const isGroup = cast.length > 1;

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

  const suspicion = useAnimatedNumber(state?.suspicion ?? START_SUSPICION, 5);

  // Mutable engine state lives in refs so SDK callbacks never see stale values.
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef<number>(0);
  const agentStoppedAt = useRef<number | null>(null);
  const userSpeechStart = useRef<number | null>(null);
  const endingRef = useRef(false);
  const lineId = useRef(0);
  /** Order of every line sent to the server: requests can arrive out of order, this can't. */
  const seq = useRef(0);
  /** Agent lines are posted one after another: a group response's parts share a tSec, so arrival order is their order. */
  const agentPosts = useRef<Promise<unknown>>(Promise.resolve());
  const voiceRef = useRef<VoiceConnection | null>(null);
  const npcSpeaking = useRef(false);

  const elapsed = () => (startedAt.current ? (performance.now() - startedAt.current) / 1000 : 0);

  const speakers = useSpeakerTracking(cast);

  const conversation = useConversation({
    onConnect: () => beginLive(),
    onDisconnect: (details) => {
      if (endingRef.current) return;
      if (goodbye.active()) void finish("caught");
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
      if (mode === "speaking") {
        goodbye.onSpeaking();
        speakers.onSpeaking();
      } else if (mode === "listening") {
        speakers.onListening();
        agentStoppedAt.current = performance.now();
        userSpeechStart.current = null;
        goodbye.onListening();
      }
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore > VAD_SPEECH) markUserSpeaking();
    },
    onAgentChatResponsePart: (part) => speakers.onResponsePart(part),
    onAudioAlignmentPlayback: ({ alignment }) => speakers.onAlignment(alignment),
    onInterruption: () => speakers.onInterruption(),
  });

  const goodbye = useBustSequence(conversation, () => void finish("caught"));

  const mock = useMockDriver({
    cast,
    segmentsOf: speakers.segmentsOf,
    setActive: speakers.setActive,
    onLine: (text) => onAgentLine(text),
    onDone: () => {
      agentStoppedAt.current = performance.now();
    },
    isEnding: () => endingRef.current,
  });

  const silence = useSilenceWatcher((sinceSec, nowSec) => {
    if (!sessionId.current) return;
    void api
      .silence(sessionId.current, sinceSec, nowSec)
      .then((res) => {
        if (!res.event || endingRef.current) return;
        setState(res.state);
        pushLine({ role: "system", text: `${res.event.quote} +${res.event.delta}`, tSec: res.event.tSec, turnIndex: res.event.turnIndex });
        react(res.event);
        if (res.state.status === "caught") return bust(res.npcMood, res.state.caughtBy);
        tellNpc(res.npcMood);
      })
      .catch((e) => console.error("silence report failed", e));
  });

  /* ---------- engine ---------- */

  function beginLive() {
    startedAt.current = performance.now();
    agentStoppedAt.current = null;
    setPhase("live");
    // The server's scene clock (which decides timeouts) starts now, ahead of the first agent line.
    const id = sessionId.current;
    if (id) agentPosts.current = agentPosts.current.then(() => api.connected(id)).catch(() => {});
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
    goodbye.onAgentLine();
    // One transcript line per character (group responses contain several voice tags).
    const id = sessionId.current;
    for (const seg of speakers.segmentsOf(text)) {
      const speaker = isGroup ? seg.name : undefined;
      const n = seq.current++;
      pushLine({ role: "agent", text: seg.text, tSec, speaker });
      agentPosts.current = agentPosts.current
        .then(() => api.event(id, n, "agent", seg.text, { responseLatencyMs: null, speechMs: null }, speaker))
        .catch(() => {});
    }
  }

  function onUserLine(text: string) {
    // Once caught, nothing the player says counts (including the nudge that triggers the goodbye).
    if (!sessionId.current || endingRef.current || goodbye.active()) return;
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
      .event(sessionId.current, seq.current++, "user", text, { responseLatencyMs, speechMs })
      .then((res) => {
        setState(res.state);
        const judged = res.judged;
        if (!judged) return;
        const breakdown = judged.event.perCharacter?.map((p) => ({ name: p.name, delta: p.delta }));
        setLines((ls) =>
          ls.map((l) => (l.id === id ? { ...l, delta: judged.event.delta, turnIndex: judged.event.turnIndex, breakdown } : l)),
        );
        react(judged.event);
        if (res.state.status === "caught") return bust(res.npcMood, res.state.caughtBy);
        tellNpc(res.npcMood);
        tellNpc(judged.npcHint);
      })
      .catch((e) => {
        setLines((ls) => ls.map((l) => (l.id === id ? { ...l, delta: undefined } : l)));
        console.error("judge request failed", e);
      });

    if (voiceRef.current?.mode === "mock") mock.reply(voiceRef.current.lines);
  }

  /** Suspicion hit 100: the NPC delivers a closing line (useBustSequence), or we hang up right away. */
  function bust(note: string | null | undefined, caughtBy?: string | null) {
    if (goodbye.active() || endingRef.current) return;
    if (voiceRef.current?.mode !== "elevenlabs" || !note) return void finish("caught");
    playCaught();
    const who = isGroup && caughtBy ? caughtBy : "you";
    goodbye.begin(
      note,
      isGroup && caughtBy
        ? `(Stage direction, not part of the conversation: ${who} has made up their mind. Only ${who} speaks now: one or two short, dry, funny sentences in character about what didn't add up, then goodbye.)`
        : "(Stage direction, not part of the conversation: you've made up your mind. Say your closing line now: one or two short, dry, funny sentences in character about what didn't add up, then goodbye.)",
      npcSpeaking.current,
    );
  }

  /** Contextual update to the NPC (mood or next-question hint). Never triggers a reply. */
  function tellNpc(text: string | null | undefined) {
    if (text && voiceRef.current?.mode === "elevenlabs" && !endingRef.current) conversation.sendContextualUpdate(text);
  }

  /** When the player's turn started (scene seconds), or null while it isn't their turn to talk. */
  function playerTurnSince(): number | null {
    const stopped = agentStoppedAt.current;
    const npcTalkingNow = voiceRef.current?.mode === "mock" ? mock.speaking() : npcSpeaking.current;
    if (goodbye.active() || stopped === null || npcTalkingNow || userSpeechStart.current !== null || !startedAt.current) return null;
    return (stopped - startedAt.current) / 1000;
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
    goodbye.clear();
    setEnding(reason);
    setPhase("ended");
    if (voiceRef.current?.mode === "elevenlabs") {
      try {
        conversation.endSession();
      } catch {
        /* already closed */
      }
    } else {
      mock.stop();
    }
    if (reason === "caught" && !goodbye.active()) playCaught();
    else if (reason === "timeout" || reason === "left") playSurvived();

    if (reason !== "caught" && sessionId.current) {
      try {
        const res = await api.end(sessionId.current, reason);
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
      const res = await api.createSession(profile, setup, draft.gapToken);
      sessionId.current = res.state.id;
      setHasSession(true);
      voiceRef.current = res.voice;
      setVoice(res.voice);
      setState(res.state);

      if (res.voice.mode === "elevenlabs") {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const common = { overrides: res.voice.overrides };
        if (res.voice.signedUrl)
          conversation.startSession({ signedUrl: res.voice.signedUrl, connectionType: "websocket", stripAudioTags: true, ...common });
        else conversation.startSession({ conversationToken: res.voice.conversationToken!, connectionType: "webrtc", ...common });
      } else {
        beginLive();
        mock.speak(res.voice.firstMessage);
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

  /* ---------- loops: timer + levels ---------- */

  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      const left = Math.max(0, setup.timeLimitSec - elapsed());
      setRemaining(left);
      if (left <= 0) void finish("timeout");
      else silence.check(playerTurnSince(), elapsed());
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

  const { activeName } = speakers;
  const mockLevel = mock.level;
  const getLevel = useCallback(
    (name: string) => {
      // Only whoever is talking moves their mouth (1-on-1: the single NPC).
      if (isGroup && activeName() !== name) return 0;
      if (voiceRef.current?.mode !== "elevenlabs") return mockLevel();
      try {
        return conversation.getOutputVolume();
      } catch {
        return 0;
      }
    },
    [conversation, isGroup, activeName, mockLevel],
  );

  /* ---------- render ---------- */

  const { activeSpeaker } = speakers;
  const { busted } = goodbye;
  const { silentFor } = silence;
  const npcTalking = voice?.mode === "elevenlabs" ? conversation.isSpeaking : !!activeSpeaker;
  const silenceWarning = phase === "live" && !busted && silentFor >= SILENCE_FIRST_SEC - 3;

  // No lines are shown during the call; the latest NPC line is only used for the "Busted" screen.
  const lastAgentAt = [...lines].reverse().find((l) => l.role === "agent")?.tSec;
  const agentBurst = lines.filter((l) => l.role === "agent" && l.tSec === lastAgentAt);
  const npcShown = agentBurst.find((l) => l.speaker && l.speaker === activeSpeaker) ?? agentBurst.at(-1) ?? null;
  const youSpeaking = userTalking && !npcTalking;
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
      {phase === "ended" && ending && (
        <EndOverlay
          reason={ending}
          npcName={state?.caughtBy ?? cast[0].name}
          lastLine={ending === "caught" ? (npcShown?.text ?? null) : null}
        />
      )}
    </>
  );
}
