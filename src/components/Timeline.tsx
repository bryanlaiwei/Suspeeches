"use client";

import { fmtTime } from "@/lib/context";
import type { SuspicionEvent } from "@/lib/types";

const W = 640;
const H = 220;
const PAD = { l: 34, r: 12, t: 14, b: 26 };

/** Suspicion over time. Markers are clickable; spikes are labelled; optional replay cursor. */
export function Timeline({
  start = 20,
  series,
  events,
  durationSec,
  spikeTurns,
  selected,
  onSelect,
  cursorSec,
}: {
  events: SuspicionEvent[];
  durationSec: number;
  spikeTurns: Set<number>;
  selected: number | null;
  onSelect: (turnIndex: number | null) => void;
  cursorSec?: number | null;
  /** Group scenes: one line per character instead of a single overall line. */
  series?: { name: string; color: string }[];
  /** Where suspicion started (depends on the character's mood). */
  start?: number;
}) {
  const START_SUSPICION = start;
  const dur = Math.max(durationSec, events.at(-1)?.tSec ?? 0, 10);
  const x = (t: number) => PAD.l + (t / dur) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);

  // Step line: suspicion holds until the next judged turn.
  let d = `M${x(0)} ${y(START_SUSPICION)}`;
  let prev = START_SUSPICION;
  for (const e of events) {
    d += ` L${x(e.tSec)} ${y(prev)} L${x(e.tSec)} ${y(e.suspicion)}`;
    prev = e.suspicion;
  }
  d += ` L${x(dur)} ${y(prev)}`;
  const area = `${d} L${x(dur)} ${y(0)} L${x(0)} ${y(0)} Z`;

  // Per-character step lines (group scenes).
  const lines = (series ?? []).map((s) => {
    let p = `M${x(0)} ${y(START_SUSPICION)}`;
    let v = START_SUSPICION;
    for (const e of events) {
      const r = e.perCharacter?.find((c) => c.name === s.name);
      if (!r) continue;
      p += ` L${x(e.tSec)} ${y(v)} L${x(e.tSec)} ${y(r.suspicion)}`;
      v = r.suspicion;
    }
    return { ...s, d: `${p} L${x(dur)} ${y(v)}` };
  });
  // Markers sit on the line of whoever moved most at that moment.
  const markerY = (e: SuspicionEvent) => {
    const top = e.perCharacter?.length ? e.perCharacter.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a)) : null;
    return y(top ? top.suspicion : e.suspicion);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Suspicion over time">
      <defs>
        <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff4b4b" stopOpacity="0.25" />
          <stop offset="60%" stopColor="#ffc800" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#58cc02" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 100 ? "#ff4b4b" : "#e3defb"} strokeDasharray={v === 100 ? "4 4" : undefined} />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#6c6a9c">
            {v}
          </text>
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={x(dur * f)} y={H - 8} textAnchor="middle" fontSize="10" fill="#6c6a9c">
          {fmtTime(dur * f)}
        </text>
      ))}
      {lines.length ? (
        <>
          {lines.map((l) => (
            <path key={l.name} d={l.d} fill="none" stroke={l.color} strokeWidth="2.5" strokeLinejoin="round" />
          ))}
          {lines.map((l, i) => (
            <g key={`legend-${l.name}`}>
              <rect x={PAD.l + 8 + i * 90} y={PAD.t + 4} width="12" height="4" rx="2" fill={l.color} />
              <text x={PAD.l + 24 + i * 90} y={PAD.t + 9} fontSize="10" fontWeight="700" fill="#2b2a5c">
                {l.name}
              </text>
            </g>
          ))}
        </>
      ) : (
        <>
          <path d={area} fill="url(#tl-fill)" />
          <path d={d} fill="none" stroke="#2b2a5c" strokeWidth="2.5" strokeLinejoin="round" />
        </>
      )}
      {cursorSec != null && (
        <line x1={x(cursorSec)} x2={x(cursorSec)} y1={PAD.t} y2={H - PAD.b} stroke="#7b6cf6" strokeWidth="2" />
      )}
      {events.map((e) => {
        const spike = spikeTurns.has(e.turnIndex);
        const r = 4 + Math.min(6, Math.abs(e.delta) / 4);
        const fill = e.delta >= 10 ? "#ff4b4b" : e.delta > 0 ? "#ffc800" : "#58cc02";
        return (
          <g key={e.turnIndex} className="cursor-pointer" onClick={() => onSelect(selected === e.turnIndex ? null : e.turnIndex)}>
            <circle cx={x(e.tSec)} cy={markerY(e)} r={r + 6} fill="transparent" />
            <circle
              cx={x(e.tSec)}
              cy={markerY(e)}
              r={r}
              fill={fill}
              stroke={selected === e.turnIndex ? "#2b2a5c" : "#ffffff"}
              strokeWidth={selected === e.turnIndex ? 3 : 2}
            />
            {spike && (
              <text x={x(e.tSec)} y={markerY(e) - r - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={fill}>
                {e.delta > 0 ? "+" : ""}
                {e.delta}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
