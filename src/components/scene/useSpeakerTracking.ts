"use client";

import { useCallback, useRef, useState } from "react";
import type { CastMember } from "@/lib/presets";
import { parseSegments } from "@/lib/voiceTags";

/** One character's part of an agent response, with its spoken length in characters. */
export interface SpeakerSegment {
  name: string;
  text: string;
  len: number;
}

/**
 * Who is talking right now. Group agents tag each character's words; the raw text streams in
 * before the audio, so we map out who says what, then switch faces at the exact character where
 * the next speaker's part starts playing (from the WebSocket's per-character playback timings).
 * All state lives in a ref so SDK callbacks never see stale values.
 */
export function useSpeakerTracking(cast: CastMember[]) {
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  /** Segments of the current agent response, chars played so far, and pending face switches. */
  const speech = useRef<{
    buffer: string;
    segments: SpeakerSegment[];
    spoken: number;
    active: string | null;
    timers: ReturnType<typeof setTimeout>[];
  }>({ buffer: "", segments: [], spoken: 0, active: null, timers: [] });

  const setActive = useCallback((name: string | null) => {
    if (speech.current.active === name) return;
    speech.current.active = name;
    setActiveSpeaker(name);
  }, []);

  /** Who is talking, read from the ref (safe in SDK callbacks and rAF loops). */
  const activeName = useCallback(() => speech.current.active, []);

  /** Names for each tagged part of an agent response (untagged text belongs to the previous speaker). */
  const segmentsOf = useCallback(
    (text: string): SpeakerSegment[] => {
      let current = cast[0].name;
      return parseSegments(text).map((s) => {
        if (s.label) current = cast.find((c) => c.label === s.label || c.name === s.label)?.name ?? current;
        return { name: current, text: s.text, len: s.text.length + 1 };
      });
    },
    [cast],
  );

  function reset() {
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

  return {
    activeSpeaker,
    activeName,
    setActive,
    segmentsOf,
    /** Raw LLM text streaming in (tags included), before the audio. */
    onResponsePart({ text, type }: { text: string; type: string }) {
      const sp = speech.current;
      if (type === "start") reset();
      else if (type === "delta") sp.buffer += text;
      sp.segments = segmentsOf(sp.buffer);
    },
    /** An audio chunk STARTS PLAYING, with per-character timings (WebSocket transport). */
    onAlignment({ chars, char_start_times_ms: startTimes }: { chars: string[]; char_start_times_ms: number[] }) {
      const sp = speech.current;
      let prev: string | null = null;
      chars.forEach((_, i) => {
        const who = speakerAt(sp.spoken + i);
        if (who && who !== prev) {
          prev = who;
          const delay = startTimes[i] ?? 0;
          if (delay <= 0) setActive(who);
          else sp.timers.push(setTimeout(() => setActive(who), delay));
        }
      });
      sp.spoken += chars.length;
    },
    onInterruption() {
      reset();
      setActive(null);
    },
    /** The NPC started talking: light up the first speaker until playback timings arrive (and for 1-on-1 scenes). */
    onSpeaking() {
      if (!speech.current.active) setActive(speech.current.segments[0]?.name ?? cast[0].name);
    },
    /** The NPC stopped. Keep the segment map (playback can pause mid-response); drop pending face switches. */
    onListening() {
      speech.current.timers.forEach(clearTimeout);
      speech.current.timers = [];
      setActive(null);
    },
  };
}
