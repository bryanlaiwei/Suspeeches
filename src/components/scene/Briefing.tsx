"use client";

import { fmtTime } from "@/lib/context";
import type { CastMember } from "@/lib/presets";
import type { GapResult, Setup } from "@/lib/schemas";
import { START_SUSPICION } from "@/lib/scoring";
import { Avatar } from "../Avatar";
import { Button, Card, cx, ERROR_NOTE, FictionNote } from "../ui";

/** The screen before the call: who you're meeting, what they know, the clock and the gap. */
export function Briefing({
  setup,
  cast,
  gap,
  onStart,
  onBack,
  error,
}: {
  setup: Setup;
  cast: CastMember[];
  gap: GapResult;
  onStart: () => void;
  onBack: () => void;
  error: string | null;
}) {
  const npcName = cast.length > 1 ? `${cast.slice(0, -1).map((c) => c.name).join(", ")} & ${cast.at(-1)!.name}` : cast[0].name;
  return (
    <div className="mx-auto grid w-full max-w-4xl items-center gap-8 pt-6 md:grid-cols-[1fr_1.2fr]">
      <div className={cx("mx-auto flex justify-center", cast.length > 1 ? "-space-x-6" : "")}>
        {cast.map((c, i) => (
          <Avatar key={i} palette={c} suspicion={START_SUSPICION} className={cast.length > 1 ? "w-36" : "w-64"} />
        ))}
      </div>
      <Card>
        <p className="text-xs font-black tracking-[0.25em] text-red">BRIEFING</p>
        <h1 className="mt-1 text-3xl font-black">You&apos;re about to meet {npcName}.</h1>
        <p className="mt-2 font-bold text-muted">
          You are <strong className="text-ink">{setup.alias}</strong>. {npcName} only knows this:
        </p>
        <ul className="mt-3 space-y-2 font-bold">
          {setup.claims.map((c) => (
            <li key={c} className="rounded-2xl bg-lav px-4 py-2.5">
              {c}
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs font-black uppercase tracking-widest text-muted">
          <div className="rounded-2xl bg-lav p-3">
            <dt>Goal</dt>
            <dd className="mt-1 text-[12px] font-bold normal-case tracking-normal text-ink">{setup.goal}</dd>
          </div>
          <div className="rounded-2xl bg-lav p-3">
            <dt>Clock</dt>
            <dd className="mt-1 text-2xl font-black text-ink">{fmtTime(setup.timeLimitSec)}</dd>
          </div>
          <div className="rounded-2xl bg-lav p-3">
            <dt>Larp gap</dt>
            <dd className="mt-1 text-2xl font-black text-ink">
              {gap.gapScore} <span className="text-xs text-purple">×{gap.multiplier.toFixed(1)}</span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm font-bold text-muted">
          {cast.length > 1
            ? "The bar over each person's head shows how suspicious they are of you. The call ends when anyone hits 100% (you're caught) or the clock runs out (you made it)."
            : `The bar over ${cast[0].name}'s head shows how suspicious they are of you. The call ends when it hits 100% (you're caught) or the clock runs out (you made it).`}
        </p>
        {error && <p className={cx(ERROR_NOTE, "mt-3")}>{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            ← Edit cover
          </Button>
          <Button className="flex-1" onClick={onStart}>
            🎙️ Start talking
          </Button>
        </div>
        <FictionNote className="mt-4" />
      </Card>
    </div>
  );
}
