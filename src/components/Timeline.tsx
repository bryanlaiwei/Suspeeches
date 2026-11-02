"use client";

import { fmtTime } from "@/lib/context";
import { SPIKE_DELTA, START_SUSPICION } from "@/lib/scoring";
import type { SuspicionEvent } from "@/lib/types";

const W = 640;
const H = 220;
const PAD = { l: 34, r: 16, t: 22, b: 26 };

/** Suspicion over time. Markers are clickable; spikes are labelled. */
export function Timeline({
  series,
  events,
  durationSec,
  spikeTurns,
  selected,
  onSelect,
}: {
  events: SuspicionEvent[];
  durationSec: number;
  spikeTurns: Set<number>;
  selected: number | null;
  onSelect: (turnIndex: number | null) => void;
  /** Group scenes: one line per character instead of a single overall line. */
  series?: { name: string; color: string }[];
}) {
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
    const top = e.perCharacter?.length
      ? e.perCharacter.reduce((a, b) =>
          Math.abs(b.delta) > Math.abs(a.delta) ? b : a,
        )
      : null;
    return y(top ? top.suspicion : e.suspicion);
  };

  return (
    <div>
      {lines.length > 0 && (
        <ul className="mb-2 flex flex-wrap justify-end gap-2">
          {lines.map((l) => (
            <li
              key={l.name}
              className="flex items-center gap-1.5 rounded-full bg-lav-soft px-2.5 py-1 text-xs font-extrabold"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: l.color }}
              />
              {l.name}
            </li>
          ))}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Suspicion over time"
      >
        <defs>
          <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--red)" stopOpacity="0.25" />
            <stop offset="60%" stopColor="var(--yellow)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 100 ? "var(--red)" : "var(--line)"}
              strokeDasharray={v === 100 ? "4 4" : undefined}
            />
            <text
              x={PAD.l - 6}
              y={y(v) + 3}
              textAnchor="end"
              fontSize="11"
              fontWeight="700"
              fill="var(--muted)"
              fontFamily="inherit"
            >
              {v}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text
            key={f}
            x={x(dur * f)}
            y={H - 8}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--muted)"
            fontFamily="inherit"
          >
            {fmtTime(dur * f)}
          </text>
        ))}
        {lines.length ? (
          <>
            {lines.map((l) => (
              <path
                key={l.name}
                d={l.d}
                fill="none"
                stroke={l.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            ))}
          </>
        ) : (
          <>
            <path d={area} fill="url(#tl-fill)" />
            <path
              d={d}
              fill="none"
              stroke="var(--ink)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </>
        )}
        {events.map((e) => {
          const spike = spikeTurns.has(e.turnIndex);
          const r = 4 + Math.min(6, Math.abs(e.delta) / 4);
          const fill =
            e.delta >= SPIKE_DELTA ? "var(--red)" : e.delta > 0 ? "var(--yellow)" : "var(--green)";
          return (
            <g
              key={e.turnIndex}
              className="cursor-pointer"
              onClick={() =>
                onSelect(selected === e.turnIndex ? null : e.turnIndex)
              }
            >
              <circle
                cx={x(e.tSec)}
                cy={markerY(e)}
                r={r + 6}
                fill="transparent"
              />
              <circle
                cx={x(e.tSec)}
                cy={markerY(e)}
                r={r}
                fill={fill}
                stroke={selected === e.turnIndex ? "var(--ink)" : "#fff"}
                strokeWidth={selected === e.turnIndex ? 3 : 2}
              />
              {spike && (
                <text
                  x={x(e.tSec)}
                  y={markerY(e) - r - 5}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="900"
                  fill={fill}
                  fontFamily="inherit"
                >
                  {e.delta > 0 ? "+" : ""}
                  {e.delta}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
