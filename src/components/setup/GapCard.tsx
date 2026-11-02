"use client";

import type { GapResult } from "@/lib/schemas";
import { Card, cx } from "../ui";

/** How far the cover story is from the real profile, and the score multiplier that buys. */
export function GapCard({ gap, fresh, loading }: { gap: GapResult | null; fresh: boolean; loading: boolean }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black">Larp gap</h2>
        {loading && (
          <span className="animate-pulse rounded-full bg-blue-soft px-3 py-1 text-xs font-black uppercase tracking-widest text-blue">
            Measuring…
          </span>
        )}
      </div>
      {gap ? (
        <div className={cx(!fresh && "opacity-50")}>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-black tabular-nums">{gap.gapScore}</span>
            <span className="font-bold text-muted">/ 100</span>
            <span className="ml-auto rounded-full bg-lav px-3 py-1 text-sm font-black text-purple">×{gap.multiplier.toFixed(2)} score</span>
          </div>
          <div className="my-3 h-2.5 overflow-hidden rounded-full bg-lav">
            <div className="h-full rounded-full bg-gradient-to-r from-green via-yellow to-red" style={{ width: `${gap.gapScore}%` }} />
          </div>
          <p className="text-sm font-bold">{gap.rationale}</p>
          {!fresh && !loading && (
            <p className="mt-2 text-xs font-extrabold text-orange-ink">Something changed. Save your cover story to update the gap.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          How far your cover is from the real you. Bigger gap, harder scene, bigger score multiplier. Save your cover story to
          measure it.
        </p>
      )}
    </Card>
  );
}
