"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { Avatar } from "@/components/Avatar";
import { ShareCard } from "@/components/ShareCard";
import { EventDetail, SuspicionBar } from "@/components/SuspicionBar";
import { Timeline } from "@/components/Timeline";
import { Transcript, type LiveLine } from "@/components/Transcript";
import { Button, Card, cx, Shell } from "@/components/ui";
import { useAnimatedNumber } from "@/components/useAnimatedNumber";
import { api } from "@/lib/client/api";
import { supabase } from "@/lib/client/supabase";
import { fmtTime } from "@/lib/context";
import { castFor, CUSTOM_PRESET, presetFor } from "@/lib/presets";
import { START_SUSPICION } from "@/lib/scoring";
import type { PublicSessionState } from "@/lib/types";

export default function DebriefPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Debrief />
      </Suspense>
    </RequireAuth>
  );
}

const VERDICT: Record<string, { label: string; color: string }> = {
  held: { label: "HELD", color: "var(--clean)" },
  shaky: { label: "SHAKY", color: "var(--warn)" },
  blown: { label: "BLOWN", color: "var(--sus)" },
  untested: { label: "UNTESTED", color: "var(--muted)" },
};

function Debrief() {
  const id = useSearchParams().get("id");
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Live server copy first; fall back to the saved game (survives server restarts).
    api
      .debrief(id)
      .then((r) => r.state)
      .catch(async (e) => {
        const { data } = (await supabase()?.from("games").select("state").eq("id", id).maybeSingle()) ?? { data: null };
        if (data?.state) return data.state as PublicSessionState;
        throw e;
      })
      .then((s) => !cancelled && setState(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

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

  const replaySuspicion = useMemo(() => {
    if (!state || cursor === null) return state?.suspicion ?? START_SUSPICION;
    let v = START_SUSPICION;
    for (const e of state.events) if (e.tSec <= cursor) v = e.suspicion;
    return v;
  }, [state, cursor]);
  const barValue = useAnimatedNumber(replaySuspicion, 6);

  function replay() {
    cancelAnimationFrame(raf.current);
    const playFor = Math.min(25, Math.max(8, duration / 6)) * 1000;
    const t0 = performance.now();
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / playFor);
      setCursor(f * duration);
      if (f < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  if (!id) return <Missing message="No session id in the link." />;
  if (error) return <Missing message={error} />;
  if (!state || !d) {
    return (
      <Shell step={3}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          The handler is writing up your debrief…
        </div>
      </Shell>
    );
  }

  const caught = d.outcome === "caught";
  const preset = state.setup.scenarioId === "custom" ? CUSTOM_PRESET : presetFor(state.setup.scenarioId);
  const selectedEvent = state.events.find((e) => e.turnIndex === selected) ?? null;
  const cast = castFor(state.setup);
  const spikeTurns = new Set(d.spikes.map((s) => s.turnIndex));

  return (
    <Shell step={3}>
      {/* hero */}
      <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
        <div className="w-40">
          <SuspicionBar value={barValue} events={[]} selected={null} onSelect={() => {}} lastDelta={null} shaking={false} />
          <Avatar palette={preset} suspicion={barValue} getLevel={() => 0} className="w-40" />
        </div>
        <div>
          <div
            className="text-6xl font-black tracking-tight sm:text-7xl"
            style={{ color: caught ? "var(--sus)" : "var(--clean)" }}
          >
            {caught ? "CAUGHT" : d.endReason === "left" ? "WALKED OUT" : "SURVIVED"}
          </div>
          <p className="mt-2 text-xl font-semibold">&ldquo;{d.headline}&rdquo;</p>
          {d.finalByCharacter && (
            <p className="mt-2 flex flex-wrap gap-3 text-sm">
              {Object.entries(d.finalByCharacter).map(([name, v]) => (
                <span key={name} className="rounded-full border border-line px-3 py-1">
                  {name} <span className="font-mono font-bold" style={{ color: v >= 100 ? "var(--sus)" : v >= 60 ? "var(--warn)" : "var(--clean)" }}>{v}</span>
                  {d.caughtBy === name && <span className="ml-1 text-sus">· caught you</span>}
                </span>
              ))}
            </p>
          )}
          <p className="mt-1 text-sm text-muted">
            {state.setup.alias} vs {state.scenarioName} · {fmtTime(d.durationSec)} on the clock ·{" "}
            {d.endReason === "npc_ended" ? `${state.scenarioName} ended the scene` : d.endReason === "timeout" ? "time ran out" : d.endReason}
          </p>
        </div>
        <Card className="text-center">
          <div className="text-xs font-bold tracking-[0.2em] text-muted">SCORE</div>
          <div className="font-mono text-5xl font-black" style={{ color: caught ? "var(--sus)" : "var(--clean)" }}>
            {d.score.toLocaleString()}
          </div>
          <div className="mt-2 font-mono text-xs text-muted">
            {d.scoreBreakdown.survival} × {d.scoreBreakdown.gapMultiplier.toFixed(2)} gap × {d.scoreBreakdown.lowSuspicionBonus.toFixed(2)} cool
          </div>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">Suspicion timeline</h2>
              <div className="flex gap-4 font-mono text-xs text-muted">
                <span>final {d.finalSuspicion}</span>
                <span>avg {d.averageSuspicion}</span>
                <span>gap {d.larpGap}</span>
              </div>
            </div>
            <Timeline
              events={state.events}
              durationSec={duration}
              spikeTurns={spikeTurns}
              selected={selected}
              onSelect={setSelected}
              cursorSec={cursor}
              series={cast.length > 1 ? cast.map((c) => ({ name: c.name, color: c.accent })) : undefined}
            />
            {selectedEvent ? (
              <div className="mt-3">
                <EventDetail event={selectedEvent} onClose={() => setSelected(null)} />
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">Click a marker to see what the judge noticed.</p>
            )}
            {d.spikes.length > 0 && (
              <ul className="mt-4 space-y-2">
                {d.spikes.map((s) => (
                  <li key={s.turnIndex}>
                    <button
                      type="button"
                      onClick={() => setSelected(s.turnIndex)}
                      className="flex w-full items-start gap-3 rounded-xl border border-line bg-bg/50 px-3 py-2 text-left text-sm hover:bg-panel-2"
                    >
                      <span className="font-mono text-xs text-muted">{fmtTime(s.tSec)}</span>
                      <span className={cx("font-mono text-xs font-bold", s.delta > 0 ? "text-sus" : "text-clean")}>
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
            <h2 className="mb-3 font-bold">Claim by claim</h2>
            <ul className="space-y-2">
              {d.claims.map((c) => (
                <li key={c.claim} className="flex items-start gap-3 rounded-xl bg-bg/50 px-3 py-2.5">
                  <span
                    className="mt-0.5 w-20 shrink-0 rounded-md px-2 py-0.5 text-center font-mono text-[10px] font-bold"
                    style={{ color: VERDICT[c.verdict].color, background: "rgba(255,255,255,.04)" }}
                  >
                    {VERDICT[c.verdict].label}
                  </span>
                  <span className="text-sm">
                    <span className="font-medium">{c.claim}</span>
                    {c.note && <span className="block text-xs text-muted">{c.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Three things for next time</h2>
            <ol className="space-y-2">
              {d.tips.map((t, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20 font-mono text-xs font-bold text-brand">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="flex max-h-[640px] flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Transcript replay</h2>
              <div className="flex gap-2">
                {cursor !== null && (
                  <Button variant="subtle" onClick={() => (cancelAnimationFrame(raf.current), setCursor(null))}>
                    Reset
                  </Button>
                )}
                <Button variant="ghost" onClick={replay}>
                  ▶ Replay
                </Button>
              </div>
            </div>
            <Transcript
              lines={lines}
              npcName={state.scenarioName}
              onSelectTurn={setSelected}
              highlightUntil={cursor ?? undefined}
              className="flex-1"
            />
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Share your debrief</h2>
            <ShareCard state={state} />
          </Card>

          {state.handler.enabled && (
            <p className="text-xs text-muted">
              {state.handler.error
                ? `Handler email failed: ${state.handler.error}`
                : `Your handler${state.handler.address ? ` (${state.handler.address})` : ""} is emailing you this debrief.`}
            </p>
          )}

          <div className="flex gap-3">
            <Link href="/setup" className="flex-1">
              <Button className="w-full">Run it back</Button>
            </Link>
            <Link href="/account">
              <Button variant="ghost">Edit profile</Button>
            </Link>
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
        <p className="mb-4 text-sm text-muted">{message}</p>
        <Link href="/setup">
          <Button>Start a new scene</Button>
        </Link>
      </Card>
    </Shell>
  );
}
