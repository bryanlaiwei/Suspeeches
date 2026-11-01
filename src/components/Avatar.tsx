"use client";

import { useEffect, useRef } from "react";

export interface AvatarPalette {
  skin: string;
  hair: string;
  accent: string;
  hairStyle?: "short" | "long" | "bun" | "curly";
}

/**
 * Simple 2D face. The mouth opens with the NPC's output volume (no lip-sync); eyes squint,
 * brows knit and the gaze drifts sideways as suspicion rises. Animation runs in rAF and writes
 * SVG attributes directly so the page does not re-render every frame.
 */
export function Avatar({
  palette,
  suspicion,
  getLevel,
  className = "",
}: {
  palette: AvatarPalette;
  /** 0..100, already smoothed by the caller. */
  suspicion: number;
  /** Returns the current speaking volume 0..1. */
  getLevel: () => number;
  className?: string;
}) {
  const mouth = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGPathElement>(null);
  const lidL = useRef<SVGRectElement>(null);
  const lidR = useRef<SVGRectElement>(null);
  const browL = useRef<SVGPathElement>(null);
  const browR = useRef<SVGPathElement>(null);
  const pupilL = useRef<SVGCircleElement>(null);
  const pupilR = useRef<SVGCircleElement>(null);
  const head = useRef<SVGGElement>(null);
  const sus = useRef(suspicion);
  const level = useRef(getLevel);
  useEffect(() => {
    sus.current = suspicion;
    level.current = getLevel;
  }, [suspicion, getLevel]);

  useEffect(() => {
    let raf = 0;
    let open = 0;
    let nextBlink = performance.now() + 2500;
    let blinkUntil = 0;
    const loop = (now: number) => {
      const s = Math.min(1, Math.max(0, sus.current / 100));
      const raw = Math.min(1, Math.max(0, level.current() * 2.2));
      open += (raw - open) * (raw > open ? 0.55 : 0.25);

      // Mouth: corners curve up when relaxed, down when suspicious; opens with volume.
      const smile = (0.45 - s) * 9;
      const o = open * 20;
      const top = 160 - o * 0.25 + smile * 0.4;
      const bottom = 160 + o + 2 - smile * 0.6;
      const cy = 160 - smile;
      mouth.current?.setAttribute(
        "d",
        `M78 ${cy} Q100 ${top - 4} 122 ${cy} Q100 ${bottom + 6} 78 ${cy} Z`,
      );
      teeth.current?.setAttribute("d", `M84 ${cy + 0.5} Q100 ${top - 2} 116 ${cy + 0.5} L116 ${cy + 3} Q100 ${top + 2} 84 ${cy + 3} Z`);
      teeth.current?.setAttribute("opacity", open > 0.15 ? "0.9" : "0");

      // Eyes: blink + squint (lids come down with suspicion).
      if (now > nextBlink) {
        blinkUntil = now + 130;
        nextBlink = now + 2500 + Math.random() * 3500;
      }
      const lid = now < blinkUntil ? 22 : 4 + s * 9;
      lidL.current?.setAttribute("height", String(lid));
      lidR.current?.setAttribute("height", String(lid));

      // Brows: knit inward + down; one brow raises in the "hmm" zone.
      const knit = s * 7;
      const raise = s > 0.35 && s < 0.75 ? Math.sin(((s - 0.35) / 0.4) * Math.PI) * 6 : 0;
      browL.current?.setAttribute("d", `M60 ${88 - raise * 0.2} Q72 ${80 - raise * 0.3} 86 ${86 + knit}`);
      browR.current?.setAttribute("d", `M114 ${86 + knit - raise} Q128 ${80 - raise * 1.2} 140 ${88 - raise}`);

      // Gaze: idle drift, side-eye when suspicious.
      const drift = Math.sin(now / 1400) * 1.5;
      const side = s > 0.6 ? (s - 0.6) * 12 : 0;
      pupilL.current?.setAttribute("cx", String(73 + drift + side));
      pupilR.current?.setAttribute("cx", String(127 + drift + side));

      // Slight head tilt with suspicion + speaking bob.
      head.current?.setAttribute("transform", `rotate(${(s * -5).toFixed(2)} 100 120) translate(0 ${(-open * 1.5).toFixed(2)})`);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const flush = Math.max(0, (suspicion - 55) / 45);

  return (
    <svg viewBox="0 0 200 230" className={className} role="img" aria-label="NPC avatar">
      <defs>
        <radialGradient id="av-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={palette.accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id="av-eye-l">
          <ellipse cx="73" cy="104" rx="11" ry="9" />
        </clipPath>
        <clipPath id="av-eye-r">
          <ellipse cx="127" cy="104" rx="11" ry="9" />
        </clipPath>
      </defs>
      <circle cx="100" cy="115" r="100" fill="url(#av-glow)" />
      {/* long hair falls behind the shoulders */}
      {palette.hairStyle === "long" && (
        <path d="M42 100 Q36 40 100 38 Q164 40 158 100 L166 196 Q100 214 34 196 Z" fill={palette.hair} />
      )}
      {/* shoulders */}
      <path d="M30 230 Q40 182 100 178 Q160 182 170 230 Z" fill={palette.accent} />
      <path d="M86 178 L100 196 L114 178 Z" fill={palette.skin} />
      <g ref={head}>
        <rect x="88" y="150" width="24" height="32" rx="8" fill={palette.skin} />
        {/* ears */}
        <ellipse cx="45" cy="112" rx="9" ry="13" fill={palette.skin} />
        <ellipse cx="155" cy="112" rx="9" ry="13" fill={palette.skin} />
        {/* head */}
        <ellipse cx="100" cy="112" rx="56" ry="66" fill={palette.skin} />
        {/* hair */}
        {palette.hairStyle === "bun" && <circle cx="100" cy="40" r="18" fill={palette.hair} />}
        {palette.hairStyle === "curly" ? (
          <g fill={palette.hair}>
            {[46, 60, 76, 92, 108, 124, 140, 154].map((cx, i) => (
              <circle key={cx} cx={cx} cy={i === 0 || i === 7 ? 88 : i === 1 || i === 6 ? 64 : 52} r={i === 0 || i === 7 ? 12 : 16} />
            ))}
          </g>
        ) : (
          <path
            d={
              palette.hairStyle === "long" || palette.hairStyle === "bun"
                ? "M44 108 Q40 44 100 42 Q160 44 156 108 Q146 70 104 62 Q70 70 44 108 Z"
                : "M44 104 Q40 46 100 42 Q160 46 156 104 Q150 74 128 68 Q100 80 70 66 Q50 76 44 104 Z"
            }
            fill={palette.hair}
          />
        )}
        {/* cheeks flush with suspicion */}
        <ellipse cx="64" cy="134" rx="10" ry="6" fill="#ff3b5c" opacity={0.08 + flush * 0.35} />
        <ellipse cx="136" cy="134" rx="10" ry="6" fill="#ff3b5c" opacity={0.08 + flush * 0.35} />
        {/* eyes */}
        <g clipPath="url(#av-eye-l)">
          <ellipse cx="73" cy="104" rx="11" ry="9" fill="#fff" />
          <circle ref={pupilL} cx="73" cy="105" r="4.6" fill="#1a1423" />
          <rect ref={lidL} x="60" y="94" width="26" height="4" fill={palette.skin} />
        </g>
        <g clipPath="url(#av-eye-r)">
          <ellipse cx="127" cy="104" rx="11" ry="9" fill="#fff" />
          <circle ref={pupilR} cx="127" cy="105" r="4.6" fill="#1a1423" />
          <rect ref={lidR} x="114" y="94" width="26" height="4" fill={palette.skin} />
        </g>
        {/* brows */}
        <path ref={browL} d="M60 88 Q72 80 86 86" stroke={palette.hair} strokeWidth="5" strokeLinecap="round" fill="none" />
        <path ref={browR} d="M114 86 Q128 80 140 88" stroke={palette.hair} strokeWidth="5" strokeLinecap="round" fill="none" />
        {/* nose */}
        <path d="M100 112 Q94 132 101 136" stroke="#00000033" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* mouth */}
        <path ref={mouth} d="M78 160 Q100 156 122 160 Q100 168 78 160 Z" fill="#3a1220" />
        <path ref={teeth} d="" fill="#fff" opacity="0" />
      </g>
    </svg>
  );
}
