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
  className = "",
}: {
  lines: LiveLine[];
  npcName: string;
  onSelectTurn?: (turnIndex: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only this box (scrollIntoView would also scroll the page).
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  return (
    <div ref={box} className={cx("min-h-0 space-y-2 overflow-y-auto pr-1", className)}>
      {lines.length === 0 && <p className="text-sm font-bold text-muted">The transcript appears here as you talk.</p>}
      {lines.map((l) => {
        if (l.role === "system") {
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => l.turnIndex !== undefined && onSelectTurn?.(l.turnIndex)}
              className="mx-auto block rounded-full bg-[#fff1c2] px-3 py-1 text-xs font-extrabold text-[#8a5a00] hover:brightness-95"
            >
              {fmtTime(l.tSec)} · {l.text}
            </button>
          );
        }
        const you = l.role === "user";
        return (
          <div key={l.id} className={cx("flex flex-col", you ? "items-end" : "items-start")}>
            <div
              className={cx(
                "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm font-bold leading-snug text-ink",
                you ? "bg-green-soft" : "bg-lav",
              )}
              title={fmtTime(l.tSec)}
            >
              {!you && <span className="font-black text-purple">{l.speaker ?? npcName}: </span>}
              {l.text}
            </div>
            {you && l.delta !== undefined && (
              <button
                type="button"
                disabled={l.delta === null || l.turnIndex === undefined}
                onClick={() => l.turnIndex !== undefined && onSelectTurn?.(l.turnIndex)}
                className={cx(
                  "mt-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold",
                  l.delta === null && "animate-pulse text-muted",
                  typeof l.delta === "number" && l.delta > 0 && "bg-[#ffd6d6] text-[#a32d2d] hover:brightness-95",
                  typeof l.delta === "number" && l.delta <= 0 && "bg-green-soft text-[#2f6b00] hover:brightness-95",
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
