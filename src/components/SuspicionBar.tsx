"use client";

import { fmtTime } from "@/lib/context";
import type { SuspicionEvent } from "@/lib/types";
import { cx, suspicionColor } from "./ui";

/**
 * The bar above the NPC's head. `value` is the smoothed display value; markers sit at the
 * suspicion level each judged turn produced and are clickable.
 */
export function SuspicionBar({
  value,
  events,
  selected,
  onSelect,
  lastDelta,
  shaking,
}: {
  value: number;
  events: SuspicionEvent[];
  selected: number | null;
  onSelect: (turnIndex: number | null) => void;
  lastDelta: { delta: number; key: number } | null;
  shaking: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  const color = suspicionColor(v);
  return (
    <div className={cx("w-full max-w-md", shaking && "animate-sus-shake")}>
      <div className="mb-1.5 flex items-end justify-between">
        <span className="text-[11px] font-bold tracking-[0.25em] text-muted">SUSPICION</span>
        <span className="relative font-mono text-2xl font-black tabular-nums" style={{ color }}>
          {Math.round(v)}
          {lastDelta && lastDelta.delta !== 0 && (
            <span
              key={lastDelta.key}
              className="animate-sus-float absolute -right-2 -top-4 translate-x-full text-sm font-bold"
              style={{ color: lastDelta.delta > 0 ? "var(--sus)" : "var(--clean)" }}
            >
              {lastDelta.delta > 0 ? "+" : ""}
              {lastDelta.delta}
            </span>
          )}
        </span>
      </div>
      <div
        className="relative h-5 rounded-full border border-line bg-bg/80 shadow-inner"
        role="meter"
        aria-label="Suspicion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${v}%`,
            background: `linear-gradient(90deg, var(--clean), ${v > 45 ? "var(--warn)" : "var(--clean)"} 55%, ${color})`,
            boxShadow: `0 0 ${8 + v / 4}px ${color}`,
          }}
        />
        {/* caught line */}
        <div className="absolute -top-1 bottom-[-4px] right-0 w-0.5 rounded bg-sus" />
        {events.map((e) => (
          <button
            key={e.turnIndex}
            type="button"
            onClick={() => onSelect(selected === e.turnIndex ? null : e.turnIndex)}
            title={`${fmtTime(e.tSec)} ${e.delta > 0 ? "+" : ""}${e.delta}`}
            className={cx(
              "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-bg transition hover:scale-150",
              e.kind === "silence" ? "rotate-45 rounded-[2px]" : "rounded-full",
              selected === e.turnIndex && "scale-150 ring-2 ring-ink",
            )}
            style={{
              left: `${Math.max(2, Math.min(98, e.suspicion))}%`,
              background: e.delta >= 10 ? "var(--sus)" : e.delta > 0 ? "var(--warn)" : "var(--clean)",
            }}
            aria-label={`Turn at ${fmtTime(e.tSec)}, ${e.delta > 0 ? "plus" : "minus"} ${Math.abs(e.delta)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wider text-muted/70">
        <span>Clean</span>
        <span>Caught</span>
      </div>
    </div>
  );
}

/** Popover content for a selected event. */
export function EventDetail({ event, onClose }: { event: SuspicionEvent; onClose: () => void }) {
  return (
    <div className="animate-sus-pop w-full max-w-md rounded-xl border border-line bg-panel-2 p-4 text-sm shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-muted">{fmtTime(event.tSec)}</span>
        <span
          className="rounded-full px-2 py-0.5 font-mono text-xs font-bold"
          style={{
            background: event.delta > 0 ? "rgba(255,59,92,.15)" : "rgba(46,230,166,.15)",
            color: event.delta > 0 ? "var(--sus)" : "var(--clean)",
          }}
        >
          {event.delta > 0 ? "+" : ""}
          {event.delta} → {event.suspicion}
        </span>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
          ✕
        </button>
      </div>
      <p className="mb-2 italic text-ink/80">&ldquo;{event.quote}&rdquo;</p>
      {event.perCharacter?.length ? (
        <ul className="mb-2 space-y-1 text-xs">
          {event.perCharacter.map((p) => (
            <li key={p.name} className="flex gap-2">
              <span className="w-14 shrink-0 font-semibold">{p.name}</span>
              <span className={cx("w-16 shrink-0 font-mono font-bold", p.delta > 0 ? "text-sus" : p.delta < 0 ? "text-clean" : "text-muted")}>
                {p.delta > 0 ? "+" : ""}
                {p.delta} → {p.suspicion}
              </span>
              <span className="text-muted">{p.reason || p.adjustments?.join(", ")}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!event.perCharacter?.length && event.judgeDelta !== undefined && event.judgeDelta !== event.delta && (
        <p className="mb-2 font-mono text-[11px] text-muted">
          judge {event.judgeDelta > 0 ? "+" : ""}
          {event.judgeDelta}
          {event.adjustments?.length ? `, ${event.adjustments.join(", ")}` : ""} → {event.delta > 0 ? "+" : ""}
          {event.delta}
        </p>
      )}
      <ul className="list-disc space-y-1 pl-4 text-ink/90">
        {event.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] uppercase tracking-wide text-muted">
        {(Object.entries(event.categories) as [string, number][]).map(([k, n]) => (
          <div key={k} className="rounded-lg bg-bg/60 px-1 py-1.5">
            <div className="font-mono text-base font-bold text-ink">{n}</div>
            {k}
          </div>
        ))}
      </div>
    </div>
  );
}
