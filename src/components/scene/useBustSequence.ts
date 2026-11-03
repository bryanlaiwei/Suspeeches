"use client";

import { useCallback, useRef, useState } from "react";

/** The bits of the ElevenLabs conversation the goodbye needs. */
interface Conversation {
  sendContextualUpdate(text: string): void;
  sendUserMessage(text: string): void;
  setVolume(opts: { volume: number }): void;
}

/**
 * Caught: whatever the NPC was saying is muted, it gets a "you've decided" note plus a nudge to
 * answer now, says a funny closing line, and we hang up once it has gone quiet for 1.5 s (20 s cap
 * if no goodbye ever comes, 15 s once it has started).
 *
 * The sound comes back when the goodbye response starts (its first streamed text part, which
 * arrives with its first audio), not when its full text arrives: over WebRTC that can be ~3 s into
 * the line, which cut off the first half. The interrupted line's text can also land after the bust.
 */
export function useBustSequence(conversation: Conversation, hangUp: () => void) {
  const [busted, setBusted] = useState(false);
  const ref = useRef<{
    goodbyeStarted: boolean;
    /** Hang-up pending once the goodbye has gone quiet (cancelled if they keep talking). */
    quiet: ReturnType<typeof setTimeout> | null;
    fallback: ReturnType<typeof setTimeout>;
  } | null>(null);

  /** Read from the ref, so it's current inside SDK callbacks. */
  const active = useCallback(() => ref.current !== null, []);

  return {
    busted,
    active,
    /** Start the goodbye. `direction` is the stage direction that makes the NPC speak. */
    begin(note: string, direction: string, npcSpeaking: boolean) {
      if (ref.current) return;
      setBusted(true);
      ref.current = { goodbyeStarted: false, quiet: null, fallback: setTimeout(hangUp, 20_000) };
      conversation.sendContextualUpdate(note);
      // Whatever they were in the middle of (usually the next question) no longer matters: mute it
      // and ask for the goodbye right away. A contextual note alone never makes the NPC talk.
      if (npcSpeaking) conversation.setVolume({ volume: 0 });
      try {
        conversation.sendUserMessage(direction);
      } catch {
        hangUp();
      }
    },
    /** An agent response started: the first one after the nudge is the goodbye, so turn the sound back on. */
    onResponseStart() {
      const b = ref.current;
      if (!b || b.goodbyeStarted) return;
      b.goodbyeStarted = true;
      conversation.setVolume({ volume: 1 });
      clearTimeout(b.fallback);
      b.fallback = setTimeout(hangUp, 15_000);
    },
    /** Still talking: don't hang up yet. */
    onSpeaking() {
      const b = ref.current;
      if (b?.quiet) {
        clearTimeout(b.quiet);
        b.quiet = null;
      }
    },
    /** The goodbye went quiet: hang up if it stays quiet (group voices pause between parts). */
    onListening() {
      const b = ref.current;
      if (!b?.goodbyeStarted) return;
      if (b.quiet) clearTimeout(b.quiet);
      b.quiet = setTimeout(hangUp, 1500);
    },
    /** The scene is ending: cancel pending hang-ups. */
    clear() {
      const b = ref.current;
      if (!b) return;
      clearTimeout(b.fallback);
      if (b.quiet) clearTimeout(b.quiet);
    },
  };
}
