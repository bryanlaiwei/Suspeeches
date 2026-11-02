"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { EventDetail, SuspicionBar } from "@/components/SuspicionBar";
import { Timeline } from "@/components/Timeline";
import { Transcript, type LiveLine } from "@/components/Transcript";
import { Avatar } from "@/components/Avatar";
import { BtnLink, Card, CHIP, cx, MOOD_STYLE, ROW as ROW_BASE, Shell } from "@/components/ui";
import { useAnimatedNumber } from "@/components/useAnimatedNumber";
import { api } from "@/lib/client/api";
import { supabase } from "@/lib/client/supabase";
import { fmtTime } from "@/lib/context";
import { castFor } from "@/lib/presets";
import { moodFor, outcomeLabel, START_SUSPICION } from "@/lib/scoring";
import type { EndReason, PublicSessionState } from "@/lib/types";

export default function DebriefPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Debrief />
      </Suspense>
    </RequireAuth>
  );
}

const VERDICT: Record<string, { label: string; chip: string }> = {
  held: { label: "HELD", chip: CHIP.good },
  shaky: { label: "SHAKY", chip: CHIP.warn },
  blown: { label: "CRACKED", chip: CHIP.bad },
  untested: { label: "UNTESTED", chip: "bg-lav text-muted" },
};

/** Light row inside a card (spikes, claims, tips). */
const ROW = cx(ROW_BASE, "flex items-start gap-3");
const H2 = "text-base font-black";

function Debrief() {
  const id = useSearchParams().get("id");
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  /** The game is still on the server (not a saved copy), so its debrief may still be being written. */
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Live server copy first; fall back to the saved game (survives server restarts).
    api
      .debrief(id)
      .then((r) => ({ s: r.state, live: true }))
      .catch(async (e) => {
        const { data } = (await supabase()?.from("games").select("state").eq("id", id).maybeSingle()) ?? { data: null };
        if (data?.state) return { s: data.state as PublicSessionState, live: false };
        throw e;
      })
      .then((r) => {
        if (cancelled) return;
        setState(r.s);
        setLive(r.live);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The debrief is written by a job on the server after the call. Check back until it's done; each
  // check also restarts the job if it failed or its server went away.
  const jobStatus = state?.job?.status;
  const polling = live && (!state?.debrief || jobStatus === "pending" || jobStatus === "running");
  useEffect(() => {
    if (!id || !polling) return;
    let tries = 0;
    const t = setInterval(() => {
      if (++tries > 90) return clearInterval(t);
      api.debrief(id).then((r) => setState(r.state), () => {});
    }, 2000);
    return () => clearInterval(t);
  }, [id, polling]);

  const d = state?.debrief;
  const duration = d ? Math.max(d.durationSec, state!.events.at(-1)?.tSec ?? 0, 1) : 1;

  const lines: LiveLine[] = useMemo(() => {
    if (!state) return [];
    const byTurn = new Map(state.events.map((e) => [e.turnIndex, e]));
    const turns: LiveLine[] = state.transcript.map((t) => ({
      id: t.index,
      role: t.role,
      text: t.text,
      tSec: t.tSec,
      speaker: t.speaker,
      delta: t.role === "user" ? (byTurn.get(t.index)?.delta ?? undefined) : undefined,
      breakdown: byTurn.get(t.index)?.perCharacter?.map((p) => ({ name: p.name, delta: p.delta })),
      turnIndex: t.index,
    }));
    const silences: LiveLine[] = state.events
      .filter((e) => e.kind === "silence")
      .map((e) => ({ id: 100_000 - e.turnIndex, role: "system", text: `${e.quote} +${e.delta}`, tSec: e.tSec, turnIndex: e.turnIndex }));
    return [...turns, ...silences].sort((a, b) => a.tSec - b.tSec);
  }, [state]);

  const barValue = useAnimatedNumber(state?.suspicion ?? START_SUSPICION, 6);

  if (!id) return <Missing message="No session id in the link." />;
  if (error) return <Missing message={error} />;
  if (!state || !d) {
    return (
      <Shell step={3}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 font-bold text-muted">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-lav-2 border-t-purple" />
          Writing up your debrief…
          {state?.job?.status === "failed" && state.job.error && (
            <span className="max-w-md text-center text-xs">The last try failed ({state.job.error}). Trying again…</span>
          )}
        </div>
      </Shell>
    );
  }

  const caught = d.outcome === "caught";
  const selectedEvent = state.events.find((e) => e.turnIndex === selected) ?? null;
  const cast = castFor(state.setup);
  const spikeTurns = new Set(d.spikes.map((s) => s.turnIndex));

  const outcome = outcomeLabel(caught, d.endReason);
  const tone = caught ? "var(--red)" : "var(--green)";
  const hero = cast.find((c) => c.name === d.caughtBy) ?? cast[0];

  return (
    <Shell step={3}>
      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* the story: result, timeline, claims, tips */}
        <div className="space-y-6">
          <Card className="text-center">
            <div className="mx-auto w-48">
              <SuspicionBar value={barValue} />
            </div>
            <div className="mx-auto mt-3 w-36 overflow-hidden rounded-3xl pt-2" style={{ background: `${hero.accent}26` }}>
              <Avatar palette={hero} suspicion={barValue} className="mx-auto w-32" />
            </div>
            <div className="mt-3 text-6xl font-black tracking-tight sm:text-7xl" style={{ color: tone }}>
              {outcome}
            </div>
            <p className="mt-2 text-lg font-extrabold">&ldquo;{d.headline}&rdquo;</p>
            {d.finalByCharacter && (
              <p className="mt-3 flex flex-wrap justify-center gap-2">
                {Object.entries(d.finalByCharacter).map(([name, v]) => (
                  <span
                    key={name}
                    className={cx(
                      "rounded-full px-3 py-1 text-xs font-extrabold",
                      MOOD_STYLE[moodFor(v)].chip,
                    )}
                  >
                    {name} {v}%{d.caughtBy === name && " · caught you"}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-2 text-sm font-bold text-muted">
              {state.setup.alias} vs {state.scenarioName} · {fmtTime(d.durationSec)} on the clock ·{" "}
              {endingText(d.endReason, d.caughtBy ?? state.scenarioName)}
            </p>
            <div className={cx("mt-4 inline-flex flex-col items-center rounded-2xl px-6 py-2", caught ? CHIP.bad : CHIP.good)}>
              <span className="text-4xl font-black tabular-nums">
                {d.score.toLocaleString()} <span className="text-lg">pts</span>
              </span>
              <span className="text-xs font-bold text-muted">
                {d.scoreBreakdown.survival} × {d.scoreBreakdown.gapMultiplier.toFixed(2)} gap × {d.scoreBreakdown.lowSuspicionBonus.toFixed(2)} cool
              </span>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className={H2}>Suspicion timeline</h2>
              <span className="text-xs font-bold text-muted">
                final {d.finalSuspicion} · avg {d.averageSuspicion} · gap {d.larpGap}
              </span>
            </div>
            <Timeline
              events={state.events}
              durationSec={duration}
              spikeTurns={spikeTurns}
              selected={selected}
              onSelect={setSelected}
              series={cast.length > 1 ? cast.map((c) => ({ name: c.name, color: c.accent })) : undefined}
            />
            {selectedEvent ? (
              <div className="mt-3">
                <EventDetail event={selectedEvent} onClose={() => setSelected(null)} />
              </div>
            ) : (
              <p className="mt-2 text-xs font-bold text-muted">Click a marker to see what the judge noticed.</p>
            )}
            {d.spikes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {d.spikes.map((s) => (
                  <li key={s.turnIndex}>
                    <button type="button" onClick={() => setSelected(s.turnIndex)} className={cx(ROW, "w-full text-left hover:bg-lav")}>
                      <span className="w-9 shrink-0 text-xs font-extrabold text-muted">{fmtTime(s.tSec)}</span>
                      <span className={cx("w-8 shrink-0 font-black", s.delta > 0 ? "text-red" : "text-green")}>
                        {s.delta > 0 ? "+" : ""}
                        {s.delta}
                      </span>
                      <span className="flex-1">{s.reason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className={cx(H2, "mb-3")}>Claim by claim</h2>
            <ul className="space-y-2">
              {d.claims.map((c) => (
                <li key={c.claim} className={ROW}>
                  <span className={cx("mt-0.5 w-24 shrink-0 rounded-lg py-0.5 text-center text-xs font-black tracking-wider", VERDICT[c.verdict].chip)}>
                    {VERDICT[c.verdict].label}
                  </span>
                  <span>
                    {c.claim}
                    {c.note && <span className="block text-xs font-semibold text-muted">{c.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className={cx(H2, "mb-3")}>Three things for next time</h2>
            <ol className="space-y-2">
              {d.tips.map((t, i) => (
                <li key={i} className={ROW}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple text-xs font-black text-white">{i + 1}</span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* the whole call, pinned on the right */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="flex max-h-[calc(100vh-10rem)] min-h-[420px] flex-col">
            <h2 className={cx(H2, "mb-3")}>Transcript</h2>
            <Transcript lines={lines} npcName={state.scenarioName} onSelectTurn={setSelected} className="flex-1" />
          </Card>
          <div className="flex flex-col gap-3">
            <BtnLink href="/setup" className="w-full">
              Run it back
            </BtnLink>
            <BtnLink href="/account" tone="white" className="w-full">
              Edit profile
            </BtnLink>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Missing({ message }: { message: string }) {
  return (
    <Shell step={3}>
      <Card className="mx-auto mt-10 max-w-md text-center">
        <p className="mb-4 text-sm font-bold text-muted">{message}</p>
        <BtnLink href="/setup">Start a new scene</BtnLink>
      </Card>
    </Shell>
  );
}

/** How the call ended, for the line under the headline. */
function endingText(reason: EndReason, who: string): string {
  switch (reason) {
    case "caught":
      return `${who} caught you`;
    case "timeout":
      return "time ran out";
    case "left":
      return "you hung up";
    case "npc_ended":
      return `${who} hung up`;
    case "error":
      return "the call dropped";
  }
}
