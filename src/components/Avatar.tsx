"use client";

import { useEffect, useId, useRef, useState } from "react";
import { moodFor, type Mood } from "@/lib/scoring";

export interface AvatarPalette {
  /** Folder under public/avatars holding happy / chill / suspicious art. */
  avatar: string;
  accent: string;
}

/** Per-character art: file type, skin tone and mouth centre (in the 660px art) for the talking mouth. */
const ART: Record<string, { ext: "png" | "svg"; skin: string; mouthY: number }> = {
  dana: { ext: "png", skin: "#bb774d", mouthY: 428 },
  sam: { ext: "png", skin: "#e8b18c", mouthY: 414 },
  "custom-female": { ext: "png", skin: "#f3c5a2", mouthY: 430 },
  "custom-male": { ext: "png", skin: "#f3c5a2", mouthY: 428 },
  priya: { ext: "svg", skin: "#a8714f", mouthY: 428 },
  maya: { ext: "svg", skin: "#f1c7a5", mouthY: 428 },
  jordan: { ext: "svg", skin: "#8d5a3b", mouthY: 428 },
  "group-f1": { ext: "svg", skin: "#f6d0b1", mouthY: 428 },
  "group-f2": { ext: "svg", skin: "#8a5636", mouthY: 428 },
  "group-m1": { ext: "svg", skin: "#d39a6e", mouthY: 428 },
  "group-m2": { ext: "svg", skin: "#7a4b2f", mouthY: 428 },
};

const MOODS = ["happy", "chill", "suspicious"] as const;
/** The face follows the NPC's tone (moodFor): warm, curious, then skeptical/cold. */
const FACE: Record<Mood, number> = { warm: 0, curious: 1, skeptical: 2, cold: 2 };
const moodIndex = (suspicion: number) => FACE[moodFor(suspicion)];
const NO_SOUND = () => 0;

/**
 * Illustrated face with three moods (happy / chill / suspicious) that crossfade as suspicion rises.
 * While the NPC speaks a mouth opens with its output volume (no lip-sync); the head tilts with
 * suspicion and sways and bobs while talking. Animation runs in rAF and writes SVG attributes
 * directly so the page does not re-render every frame. The loop stops once the face has settled and
 * nobody is speaking, and wakes up when suspicion or `speaking` changes.
 */
export function Avatar({
  palette,
  suspicion,
  getLevel = NO_SOUND,
  speaking = false,
  onCall = false,
  className = "",
}: {
  palette: AvatarPalette;
  /** 0..100, already smoothed by the caller. */
  suspicion: number;
  /** Returns the current speaking volume 0..1 (omit for faces that never talk). */
  getLevel?: () => number;
  /** This character may be talking: keep polling getLevel. */
  speaking?: boolean;
  /** On a call tile: no background circle, shoulders down to the bottom edge (scripts/gen-call-avatars.ts). */
  onCall?: boolean;
  className?: string;
}) {
  const art = ART[palette.avatar] ?? ART["custom-female"];
  const id = ART[palette.avatar] ? palette.avatar : "custom-female";
  const layers = useRef<(SVGImageElement | null)[]>([]);
  const talk = useRef<SVGGElement>(null);
  const mouth = useRef<SVGPathElement>(null);
  const mouthClip = useRef<SVGPathElement>(null);
  const tongue = useRef<SVGEllipseElement>(null);
  const head = useRef<SVGGElement>(null);
  const sus = useRef(suspicion);
  const level = useRef(getLevel);
  const talking = useRef(speaking);
  /** Restarts the animation loop if it has stopped. */
  const wake = useRef(() => {});
  useEffect(() => {
    sus.current = suspicion;
    level.current = getLevel;
    talking.current = speaking;
    wake.current();
  }, [suspicion, getLevel, speaking]);

  const [initialMood] = useState(() => moodIndex(suspicion));
  const clip = `av-mouth-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const mouthY = art.mouthY;
  useEffect(() => {
    let raf = 0;
    let running = false;
    let open = 0;
    let swing = 0;
    const op: number[] = MOODS.map((_, i) => (i === initialMood ? 1 : 0));
    const loop = (now: number) => {
      const s = Math.min(1, Math.max(0, sus.current / 100));
      const raw = Math.min(1, Math.max(0, level.current() * 2.2));
      open += (raw - open) * (raw > open ? 0.55 : 0.25);

      // Mood crossfade: a new mood above fades in over the old one; one below is revealed as
      // the layers above it fade out. Never shows the tile through a half-faded face.
      const target = moodIndex(sus.current);
      let top = 0;
      op.forEach((v, i) => v > 0.01 && (top = i));
      if (target < top) {
        op[target] = 1;
        for (let i = 0; i < op.length; i++) if (i > target) op[i] = Math.max(0, op[i] - 0.07);
        for (let i = 0; i < target; i++) op[i] = 0;
      } else {
        op[target] = Math.min(1, op[target] + 0.07);
        if (op[target] >= 1) for (let i = 0; i < target; i++) op[i] = 0;
      }
      op.forEach((v, i) => layers.current[i]?.setAttribute("opacity", v.toFixed(3)));

      // Mouth: covers the drawn mouth and opens with volume; flatter when suspicious.
      const shown = Math.min(1, Math.max(0, (open - 0.04) * 10));
      talk.current?.setAttribute("opacity", shown.toFixed(3));
      const w = 36 - s * 8;
      const h = 4 + open * 34;
      const lift = (0.5 - s) * 8;
      const d = `M${330 - w} ${mouthY - 6} Q330 ${mouthY - 6 - lift} ${330 + w} ${mouthY - 6} Q${330 + w} ${mouthY - 6 + h} 330 ${mouthY - 6 + h} Q${330 - w} ${mouthY - 6 + h} ${330 - w} ${mouthY - 6} Z`;
      mouth.current?.setAttribute("d", d);
      mouthClip.current?.setAttribute("d", d);
      tongue.current?.setAttribute("cy", String(mouthY - 6 + h));
      tongue.current?.setAttribute("opacity", open > 0.3 ? "1" : "0");

      // Slight head tilt with suspicion, a gentle sway while they might be talking, and a speaking bob.
      swing += ((talking.current ? 1 : 0) - swing) * 0.05;
      const sway = Math.sin(now / 1400) * 0.6 * swing;
      head.current?.setAttribute(
        "transform",
        `rotate(${(s * -5 + sway).toFixed(2)} 330 600) translate(0 ${(-open * 5).toFixed(2)})`,
      );

      const settled = !talking.current && open < 0.002 && swing < 0.01 && op.every((v, i) => v === (i === target ? 1 : 0));
      if (settled) running = false;
      else raf = requestAnimationFrame(loop);
    };
    wake.current = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    wake.current();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      wake.current = () => {};
    };
  }, [initialMood, mouthY]);

  return (
    // Given a box that isn't square (a call tile), the art fits inside it and stands on its bottom edge.
    <svg viewBox="0 0 660 660" preserveAspectRatio="xMidYMax meet" className={className} role="img" aria-label="NPC avatar">
      <defs>
        <clipPath id={clip}>
          <path ref={mouthClip} d="" />
        </clipPath>
      </defs>
      <g ref={head}>
        {MOODS.map((m, i) => (
          <image
            key={m}
            ref={(el) => {
              layers.current[i] = el;
            }}
            href={onCall ? `/avatars/${id}/${m}-call.png` : `/avatars/${id}/${m}.${art.ext}`}
            width="660"
            height="660"
            opacity={i === initialMood ? 1 : 0}
          />
        ))}
        <g ref={talk} opacity="0">
          <ellipse cx="330" cy={mouthY} rx="50" ry="26" fill={art.skin} />
          <path ref={mouth} d="" fill="#2e2b5f" />
          <g clipPath={`url(#${clip})`}>
            <ellipse ref={tongue} cx="330" cy={mouthY} rx="22" ry="11" fill="#ff86d0" opacity="0" />
          </g>
        </g>
      </g>
    </svg>
  );
}
