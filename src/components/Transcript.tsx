"use client";

import { useEffect, useRef } from "react";
import { fmtTime } from "@/lib/context";
import { cx } from "./ui";

export interface LiveLine {
  id: number;
  role: "user" | "agent" | "system";
  /** Character name for agent lines in group scenes. */
  speaker?: string;
  /** Group scenes: each character's reaction to this user line. */
  breakdown?: { name: string; delta: number }[];
  text: string;
  tSec: number;
  /** undefined = not a judged line; null = judging; number = delta */
  delta?: number | null;
  turnIndex?: number;
}

export function Transcript({
  lines,
  npcName,
  onSelectTurn,
  highlightUntil,
  className = "",
}: {
  lines: LiveLine[];
  npcName: string;
  onSelectTurn?: (turnIndex: number) => void;
  /** Replay mode: lines after this time are dimmed. */
  highlightUntil?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only this box (scrollIntoView would also scroll the page).
    const el = box.current;
    if (el && highlightUntil === undefined) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length, highlightUntil]);

  return (
    <div ref={box} className={cx("min-h-0 space-y-3 overflow-y-auto pr-1", className)}>
      {lines.length === 0 && <p className="text-sm text-muted">The transcript appears here as you talk.</p>}
      {lines.map((l) => {
        const future = highlightUntil !== undefined && l.tSec > highlightUntil;
        if (l.role === "system") {
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => l.turnIndex !== undefined && onSelectTurn?.(l.turnIndex)}
              className={cx(
                "mx-auto block rounded-full border border-warn/40 bg-warn/10 px-3 py-1 font-mono text-[11px] text-warn transition-opacity",
                future && "opacity-25",
              )}
            >
              {fmtTime(l.tSec)} · {l.text}
            </button>
          );
        }
        return (
          <div
            key={l.id}
            className={cx("flex flex-col transition-opacity", l.role === "user" ? "items-end" : "items-start", future && "opacity-25")}
          >
            <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {l.role === "user" ? "You" : (l.speaker ?? npcName)} · {fmtTime(l.tSec)}
            </span>
            <div
              className={cx(
                "max-w-[90%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                l.role === "user" ? "rounded-br-sm bg-brand/20 text-ink" : "rounded-bl-sm bg-panel-2 text-ink/90",
              )}
            >
              {l.text}
            </div>
            {l.role === "user" && l.delta !== undefined && (
              <button
                type="button"
                disabled={l.delta === null || l.turnIndex === undefined}
                onClick={() => l.turnIndex !== undefined && onSelectTurn?.(l.turnIndex)}
                className={cx(
                  "mt-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold",
                  l.delta === null && "animate-pulse text-muted",
                  typeof l.delta === "number" && l.delta > 0 && "bg-sus/15 text-sus hover:bg-sus/25",
                  typeof l.delta === "number" && l.delta <= 0 && "bg-clean/15 text-clean hover:bg-clean/25",
                )}
              >
                {l.delta === null
                  ? "judging…"
                  : l.breakdown?.length
                    ? l.breakdown.map((b) => `${b.name} ${b.delta > 0 ? "+" : ""}${b.delta}`).join(" · ")
                    : `${l.delta > 0 ? "+" : ""}${l.delta} suspicion`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
