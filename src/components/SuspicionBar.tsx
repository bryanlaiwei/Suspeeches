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
        <span className="text-xs font-black tracking-[0.2em] text-muted">SUSPICION</span>
        <span className="relative text-2xl font-black tabular-nums" style={{ color }}>
          {Math.round(v)}
          {lastDelta && lastDelta.delta !== 0 && (
            <span
              key={lastDelta.key}
              className="animate-sus-float absolute -right-2 -top-4 translate-x-full text-sm font-black"
              style={{ color: lastDelta.delta > 0 ? "var(--red)" : "var(--green)" }}
            >
              {lastDelta.delta > 0 ? "+" : ""}
              {lastDelta.delta}
            </span>
          )}
        </span>
      </div>
      <div
        className="relative h-5 rounded-full bg-white shadow-[inset_0_0_0_2px_var(--lav-2)]"
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
            background: color,
          }}
        />
        {/* caught line */}
        <div className="absolute -top-1 bottom-[-4px] right-0 w-0.5 rounded bg-red" />
        {events.map((e) => (
          <button
            key={e.turnIndex}
            type="button"
            onClick={() => onSelect(selected === e.turnIndex ? null : e.turnIndex)}
            title={`${fmtTime(e.tSec)} ${e.delta > 0 ? "+" : ""}${e.delta}`}
            className={cx(
              "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-white transition hover:scale-150",
              e.kind === "silence" ? "rotate-45 rounded-[2px]" : "rounded-full",
              selected === e.turnIndex && "scale-150 ring-2 ring-ink",
            )}
            style={{
              left: `${Math.max(2, Math.min(98, e.suspicion))}%`,
              background: e.delta >= 10 ? "var(--red)" : e.delta > 0 ? "var(--yellow)" : "var(--green)",
            }}
            aria-label={`Turn at ${fmtTime(e.tSec)}, ${e.delta > 0 ? "plus" : "minus"} ${Math.abs(e.delta)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs font-extrabold uppercase tracking-wider text-muted">
        <span>Clean</span>
        <span>Caught</span>
      </div>
    </div>
  );
}

/** Popover content for a selected event. */
export function EventDetail({ event, onClose }: { event: SuspicionEvent; onClose: () => void }) {
  return (
    <div className="animate-sus-pop w-full rounded-2xl border-2 border-lav-2 bg-white p-4 text-sm font-bold shadow-[0_3px_0_var(--lav-2)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-extrabold text-muted">{fmtTime(event.tSec)}</span>
        <span
          className={cx(
            "rounded-full px-2.5 py-0.5 text-xs font-black",
            event.delta > 0 ? "bg-[#ffd6d6] text-[#a32d2d]" : "bg-green-soft text-[#2f6b00]",
          )}
        >
          {event.delta > 0 ? "+" : ""}
          {event.delta} → {event.suspicion}
        </span>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
          ✕
        </button>
      </div>
      <p className="mb-2 font-extrabold italic">&ldquo;{event.quote}&rdquo;</p>
      {event.perCharacter?.length ? (
        <ul className="mb-2 space-y-1 text-xs">
          {event.perCharacter.map((p) => (
            <li key={p.name} className="flex gap-2">
              <span className="w-14 shrink-0 font-black">{p.name}</span>
              <span className={cx("w-16 shrink-0 font-black tabular-nums", p.delta > 0 ? "text-red" : p.delta < 0 ? "text-green" : "text-muted")}>
                {p.delta > 0 ? "+" : ""}
                {p.delta} → {p.suspicion}
              </span>
              <span className="text-muted">{p.reason || p.adjustments?.join(", ")}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!event.perCharacter?.length && event.judgeDelta !== undefined && event.judgeDelta !== event.delta && (
        <p className="mb-2 text-xs text-muted">
          judge {event.judgeDelta > 0 ? "+" : ""}
          {event.judgeDelta}
          {event.adjustments?.length ? `, ${event.adjustments.join(", ")}` : ""} → {event.delta > 0 ? "+" : ""}
          {event.delta}
        </p>
      )}
      <ul className="list-disc space-y-1 pl-4">
        {event.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs font-extrabold uppercase tracking-wide text-muted">
        {(Object.entries(event.categories) as [string, number][]).map(([k, n]) => (
          <div key={k} className="rounded-xl bg-[#f6f4ff] px-1 py-1.5">
            <div className="text-base font-black text-ink">{n}</div>
            {k}
          </div>
        ))}
      </div>
    </div>
  );
}
