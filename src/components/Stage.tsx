"use client";

import type { CastMember } from "@/lib/presets";
import { moodFor, START_SUSPICION } from "@/lib/scoring";
import type { SuspicionEvent } from "@/lib/types";
import { Avatar } from "./Avatar";
import { cx, suspicionColor } from "./ui";
import { useAnimatedNumber } from "./useAnimatedNumber";

const MOOD_COLOR = { warm: "text-clean", curious: "text-ink", skeptical: "text-warn", cold: "text-sus" } as const;

/**
 * The NPC(s) on stage. One big face for 1-on-1 scenes (its bar is drawn by the caller); for groups,
 * a row of faces, each with their own suspicion bar, mood and +/- pop.
 */
export function Stage({
  cast,
  active,
  suspicion,
  suspicionBy,
  lastEvent,
  getLevel,
  shaking,
}: {
  cast: CastMember[];
  /** Name of whoever is speaking right now (groups). */
  active: string | null;
  suspicion: number;
  suspicionBy: Record<string, number> | null;
  /** Latest judged event, for per-character pops. */
  lastEvent: SuspicionEvent | null;
  getLevel: (name: string) => number;
  shaking: boolean;
}) {
  if (cast.length === 1) {
    const c = cast[0];
    return (
      <>
        <div className={cx("relative mt-2 w-full max-w-[300px]", shaking && "animate-sus-shake")}>
          <Avatar palette={c} suspicion={suspicion} getLevel={() => getLevel(c.name)} className="w-full drop-shadow-2xl" />
        </div>
        <div className="mt-1 text-center">
          <div className="text-xl font-bold">{c.name}</div>
          <div className="text-sm text-muted">{c.title}</div>
        </div>
      </>
    );
  }
  return (
    <div className={cx("mt-2 grid w-full max-w-xl gap-3", cast.length === 3 ? "grid-cols-3" : "grid-cols-2", shaking && "animate-sus-shake")}>
      {cast.map((c) => (
        <Member
          key={c.name}
          member={c}
          value={suspicionBy?.[c.name] ?? START_SUSPICION}
          speaking={active === c.name}
          dimmed={!!active && active !== c.name}
          reaction={lastEvent?.perCharacter?.find((p) => p.name === c.name) ?? null}
          eventKey={lastEvent?.turnIndex ?? null}
          getLevel={getLevel}
        />
      ))}
    </div>
  );
}

function Member({
  member: c,
  value,
  speaking,
  dimmed,
  reaction,
  eventKey,
  getLevel,
}: {
  member: CastMember;
  value: number;
  speaking: boolean;
  dimmed: boolean;
  reaction: { delta: number; reason?: string } | null;
  eventKey: number | null;
  getLevel: (name: string) => number;
}) {
  const shown = useAnimatedNumber(value, 5);
  const color = suspicionColor(shown);
  const mood = moodFor(value);
  return (
    <div className="flex flex-col items-center">
      {/* own bar above the head */}
      <div className="mb-1 w-full max-w-[150px]" title={`${c.name}: ${Math.round(shown)}/100`}>
        <div className="mb-0.5 flex items-end justify-between">
          <span className="text-[9px] font-bold tracking-[0.2em] text-muted">SUS</span>
          <span className="relative font-mono text-sm font-black tabular-nums" style={{ color }}>
            {Math.round(shown)}
            {reaction && reaction.delta !== 0 && (
              <span
                key={eventKey ?? 0}
                className="animate-sus-float absolute -top-3 left-full ml-1 text-xs font-bold"
                style={{ color: reaction.delta > 0 ? "var(--sus)" : "var(--clean)" }}
              >
                {reaction.delta > 0 ? "+" : ""}
                {reaction.delta}
              </span>
            )}
          </span>
        </div>
        <div className="relative h-2.5 rounded-full border border-line bg-bg/80">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, shown))}%`, background: color, boxShadow: `0 0 ${4 + shown / 8}px ${color}` }}
          />
          <div className="absolute -top-0.5 bottom-[-2px] right-0 w-0.5 rounded bg-sus" />
        </div>
      </div>
      <div
        className={cx(
          "w-full max-w-[160px] transition duration-300",
          speaking ? "scale-105 opacity-100" : dimmed ? "scale-95 opacity-60" : "opacity-90",
        )}
      >
        <Avatar palette={c} suspicion={shown} getLevel={() => getLevel(c.name)} className="w-full" />
      </div>
      <div className={cx("mt-1 text-center transition", speaking ? "text-ink" : "text-muted")}>
        <div className="flex items-center justify-center gap-1.5 font-bold">
          {speaking && <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />}
          {c.name}
        </div>
        <div className="text-xs">{c.title}</div>
        <div className="mt-0.5 text-[11px]">
          <span className={cx("font-semibold", MOOD_COLOR[mood])}>{mood}</span>
        </div>
      </div>
    </div>
  );
}
