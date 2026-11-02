"use client";

import { useCallback, useRef } from "react";
import type { CastMember } from "@/lib/presets";
import type { SpeakerSegment } from "./useSpeakerTracking";

/**
 * MOCK_MODE dev aid: a scripted NPC spoken with the browser's speech synthesis (one pitch per
 * character), so the call screen runs without ElevenLabs.
 */
export function useMockDriver(opts: {
  cast: CastMember[];
  segmentsOf: (text: string) => SpeakerSegment[];
  setActive: (name: string | null) => void;
  /** Every scripted line, as if the agent had said it. */
  onLine: (text: string) => void;
  /** Finished speaking: the player's turn starts. */
  onDone: () => void;
  isEnding: () => boolean;
}) {
  const mock = useRef({ speaking: false, lineIdx: 0 });

  const speaking = useCallback(() => mock.current.speaking, []);

  /** A fake talking envelope while speech synthesis runs. */
  const level = useCallback(() => {
    if (!mock.current.speaking) return 0;
    const t = performance.now() / 1000;
    return 0.25 + 0.2 * Math.abs(Math.sin(t * 11)) + 0.1 * Math.sin(t * 23);
  }, []);

  function speak(text: string) {
    const { cast, segmentsOf, setActive, onLine, onDone, isEnding } = opts;
    onLine(text);
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    const segments = segmentsOf(text);
    mock.current.speaking = true;
    const done = () => {
      mock.current.speaking = false;
      setActive(null);
      onDone();
    };
    // Speak each character's part in turn, lighting up whoever is talking.
    const next = (i: number) => {
      const seg = segments[i];
      if (!seg || isEnding()) return done();
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

  return {
    speak,
    speaking,
    level,
    /** The next scripted line, after a short beat. */
    reply(lines: string[]) {
      setTimeout(() => {
        if (opts.isEnding()) return;
        const line = lines[mock.current.lineIdx % lines.length];
        mock.current.lineIdx++;
        speak(line);
      }, 900);
    },
    stop() {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
  };
}
