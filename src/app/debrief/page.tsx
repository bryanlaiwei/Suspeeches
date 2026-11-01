"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { ShareCard } from "@/components/ShareCard";
import { StageShell } from "@/components/Shells";
import { EventDetail } from "@/components/SuspicionBar";
import { Timeline } from "@/components/Timeline";
import { Transcript, type LiveLine } from "@/components/Transcript";
import { Btn, BtnLink, Card, cx, Face, Tag } from "@/components/ui";
import { api } from "@/lib/client/api";
import { loadSetupDraft, saveSetupDraft } from "@/lib/client/storage";
import { supabase } from "@/lib/client/supabase";
import { fmtTime } from "@/lib/context";
import { castFor, castName } from "@/lib/presets";
import type { PublicSessionState, SuspicionEvent } from "@/lib/types";

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
  held: { label: "HELD", color: "bg-green text-white" },
  shaky: { label: "SHAKY", color: "bg-yellow text-ink" },
  blown: { label: "BLOWN", color: "bg-red text-white" },
  untested: { label: "UNTESTED", color: "bg-lav-2 text-ink" },
};

/** Funny but plain verdict for the results header. */
function verdict(state: PublicSessionState) {
  const d = state.debrief!;
  const who = castName(state.setup);
  if (d.outcome === "caught") return { tag: "BUSTED", tagColor: "bg-red text-white", title: "Busted!", sub: `${d.caughtBy ?? who} saw right through you.` };
  if (d.endReason === "left") return { tag: "YOU HUNG UP", tagColor: "bg-yellow text-ink", title: "Ghosted 'em!", sub: `You left ${who} mid-sentence. Bold.` };
  if (d.averageSuspicion < 35) return { tag: "CALL ENDED", tagColor: "bg-yellow text-ink", title: "Smooth operator!", sub: `You totally fooled ${who}.` };
  if (d.finalSuspicion < 70) return { tag: "CALL ENDED", tagColor: "bg-yellow text-ink", title: "Got away with it!", sub: `You almost fooled ${who}.` };
  return { tag: "CALL ENDED", tagColor: "bg-yellow text-ink", title: "Saved by the bell!", sub: `${who} was one question away from catching you.` };
}

function Debrief() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [share, setShare] = useState(false);
  const raf = useRef(0);
  const detailsRef = useRef<HTMLDivElement>(null);

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

  // While the follow-up email is sending, refresh a few times so it shows "Sent to …".
  const sending = !!state?.followup && !state.followup.sentTo && state.handler.enabled && !state.handler.error;
  useEffect(() => {
    if (!sending || !id) return;
    let tries = 0;
    const t = setInterval(async () => {
      if (++tries > 10) return clearInterval(t);
      const res = await fetch(`/api/session/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (res?.state) setState(res.state);
    }, 2000);
    return () => clearInterval(t);
  }, [sending, id]);

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

  function retry() {
    if (!state) return;
    const draft = loadSetupDraft() ?? {};
    saveSetupDraft({ ...draft, ...state.setup, gap: state.gap, gapFor: JSON.stringify([state.setup.alias, state.setup.claims]), callReady: true });
    router.push("/scene");
  }

  function openDetails(e: SuspicionEvent) {
    setDetails(true);
    setSelected(e.turnIndex);
    setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  if (!id) return <Missing message="That link is missing its call id." />;
  if (error) return <Missing message={error} />;
  if (!state || !d) {
    return (
      <StageShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-lime" />
          <p className="text-xl font-black">Reviewing the tape…</p>
          <p className="font-bold text-white/75">Counting your ums. All of them.</p>
        </div>
      </StageShell>
    );
  }

  const v = verdict(state);
  const cast = castFor(state.setup);
  const main = (d.caughtBy && cast.find((c) => c.name === d.caughtBy)) || cast[0];
  const turnEvents = state.events.filter((e) => e.kind === "turn");
  const goodReplies = turnEvents.filter((e) => e.delta <= 3).length;
  const worst = [...state.events].sort((a, b) => b.delta - a.delta)[0];
  const best = [...turnEvents].sort((a, b) => a.delta - b.delta)[0];
  const spikeTurns = new Set(d.spikes.map((s) => s.turnIndex));
  const selectedEvent = state.events.find((e) => e.turnIndex === selected) ?? null;

  return (
    <>
      <StageShell
        right={
          <Link href="/home" aria-label="Close" className="text-white/90 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M5 5l14 14M19 5 5 19" />
            </svg>
          </Link>
        }
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-5 pb-14 pt-4">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Face art={main.art} suspicion={d.finalSuspicion} size={180} className="bg-white" ring="rgba(255,255,255,0.25)" />
            <div className="text-center sm:text-left">
              <Tag color={v.tagColor}>{v.tag}</Tag>
              <h1 className="mt-2 text-5xl font-black leading-tight">{v.title}</h1>
              <p className="mt-1 text-xl font-bold text-white/85">{v.sub}</p>
            </div>
          </div>

          <div className="mt-10 grid w-full grid-cols-3 gap-4">
            <Stat label="Larp score" value={String(d.larpScore ?? 0)} color="yellow" />
            <Stat label="Suspicion" value={`${d.finalSuspicion}%`} color="red" />
            <Stat label="Replies" value={`${goodReplies}/${turnEvents.length}`} color="blue" hint="Answers that didn't raise eyebrows" />
          </div>

          <div className="mt-6 grid w-full gap-4 sm:grid-cols-2">
            {worst && worst.delta > 0 && (
              <Moment
                label="Biggest slip-up"
                text={worst.kind === "silence" ? worst.quote : `“${worst.quote}”`}
                delta={worst.delta}
                tone="bad"
                onClick={() => openDetails(worst)}
              />
            )}
            {best && best.delta < 0 && (
              <Moment label="Best moment" text={best.reasons[0] ?? best.quote} delta={best.delta} tone="good" onClick={() => openDetails(best)} />
            )}
          </div>

          {state.followup && (
            <Link href="/messages" className="mt-6 flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 font-extrabold transition hover:bg-white/25">
              📬 {state.followup.sender} sent you a message
              <span className="text-lime">{state.followup.goalReached ? "· good news!" : "· uh oh"}</span>
              <span aria-hidden>→</span>
            </Link>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Btn onClick={retry} size="lg">
              ↻ Retry
            </Btn>
            <BtnLink href="/scenario" tone="white" size="lg">
              New scenario
            </BtnLink>
            <Btn tone="blue" size="lg" onClick={() => setShare((s) => !s)}>
              ⇪ Share
            </Btn>
          </div>
          {share && (
            <div className="animate-sus-pop mt-6 w-full rounded-3xl bg-white p-5 text-ink">
              <ShareCard state={state} />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setDetails((x) => !x);
              setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
            className="mt-10 text-sm font-black uppercase tracking-widest text-white/85 hover:text-white"
          >
            {details ? "Hide" : "See"} the full breakdown {details ? "▴" : "▾"}
          </button>
        </div>
      </StageShell>

      {details && (
        <div ref={detailsRef} className="bg-lav px-5 py-12">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6">
              <Card>
                <p className="text-lg font-black">“{d.headline}”</p>
                <p className="mt-1 text-sm font-bold text-muted">
                  {state.setup.alias} vs {state.scenarioName} · {fmtTime(d.durationSec)} on the clock · {d.score.toLocaleString()} pts (
                  {d.scoreBreakdown.survival} × {d.scoreBreakdown.gapMultiplier.toFixed(2)} lie size × {d.scoreBreakdown.lowSuspicionBonus.toFixed(2)} cool
                  {d.scoreBreakdown.moodMultiplier && d.scoreBreakdown.moodMultiplier !== 1 ? ` × ${d.scoreBreakdown.moodMultiplier} mood` : ""})
                </p>
                {d.finalByCharacter && (
                  <p className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
                    {Object.entries(d.finalByCharacter).map(([name, val]) => (
                      <span key={name} className="rounded-full bg-lav px-3 py-1">
                        {name} {val}%{d.caughtBy === name && <span className="text-red"> · caught you</span>}
                      </span>
                    ))}
                  </p>
                )}
              </Card>

              <Card>
                <h2 className="text-xl font-black">Suspicion over time</h2>
                <Timeline
                  events={state.events}
                  durationSec={duration}
                  spikeTurns={spikeTurns}
                  selected={selected}
                  onSelect={setSelected}
                  cursorSec={cursor}
                  start={state.startSuspicion ?? 20}
                  series={cast.length > 1 ? cast.map((c) => ({ name: c.name, color: c.accent })) : undefined}
                />
                {selectedEvent ? (
                  <div className="mt-3">
                    <EventDetail event={selectedEvent} onClose={() => setSelected(null)} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-bold text-muted">Tap a dot to see what they noticed.</p>
                )}
              </Card>

              <Card>
                <h2 className="mb-3 text-xl font-black">Claim by claim</h2>
                <ul className="space-y-2">
                  {d.claims.map((c) => (
                    <li key={c.claim} className="flex items-start gap-3 rounded-2xl bg-lav px-3 py-2.5">
                      <span className={cx("mt-0.5 w-24 shrink-0 rounded-lg px-2 py-1 text-center text-[11px] font-black", VERDICT[c.verdict].color)}>
                        {VERDICT[c.verdict].label}
                      </span>
                      <span className="text-sm">
                        <span className="font-extrabold">{c.claim}</span>
                        {c.note && <span className="block font-semibold text-muted">{c.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card>
                <h2 className="mb-3 text-xl font-black">Three things for next time</h2>
                <ol className="space-y-3">
                  {d.tips.map((t, i) => (
                    <li key={i} className="flex gap-3 font-semibold">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple text-sm font-black text-white">{i + 1}</span>
                      <span className="pt-0.5">{t}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="flex max-h-[640px] flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-black">Replay the call</h2>
                  <div className="flex gap-2">
                    {cursor !== null && (
                      <Btn tone="ghost" size="sm" onClick={() => (cancelAnimationFrame(raf.current), setCursor(null))}>
                        Reset
                      </Btn>
                    )}
                    <Btn tone="white" size="sm" onClick={replay}>
                      ▶ Replay
                    </Btn>
                  </div>
                </div>
                <Transcript lines={lines} npcName={state.scenarioName} onSelectTurn={setSelected} highlightUntil={cursor ?? undefined} className="flex-1" />
              </Card>

              {state.followup && (
                <Card>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-xl font-black">📬 {state.followup.sender}&apos;s follow-up</h2>
                    <Tag color={state.followup.goalReached ? "bg-green text-white" : "bg-red text-white"}>
                      {state.followup.goalReached ? "GOAL REACHED" : "GOAL MISSED"}
                    </Tag>
                  </div>
                  <div className="rounded-2xl bg-lav p-4 text-sm">
                    <p className="mb-2 font-black">{state.followup.subject}</p>
                    <p className="whitespace-pre-wrap font-semibold leading-relaxed">{state.followup.body}</p>
                  </div>
                  <FollowupStatus state={state} onSent={setState} />
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, color, hint }: { label: string; value: string; color: "yellow" | "red" | "blue"; hint?: string }) {
  const c = {
    yellow: { frame: "bg-yellow border-yellow", text: "text-[#e5a800]", label: "text-ink" },
    red: { frame: "bg-red border-red", text: "text-red", label: "text-white" },
    blue: { frame: "bg-blue border-blue", text: "text-blue", label: "text-white" },
  }[color];
  return (
    <div className={cx("overflow-hidden rounded-3xl border-4 shadow-[0_5px_0_rgba(43,42,92,0.18)]", c.frame)} title={hint}>
      <div className={cx("py-2 text-center text-xs font-black uppercase tracking-widest", c.label)}>{label}</div>
      <div className={cx("rounded-t-2xl bg-white py-5 text-center text-5xl font-black tabular-nums", c.text)}>{value}</div>
    </div>
  );
}

function Moment({ label, text, delta, tone, onClick }: { label: string; text: string; delta: number; tone: "good" | "bad"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex items-center gap-4 rounded-3xl px-5 py-4 text-left text-ink shadow-[0_5px_0_rgba(43,42,92,0.18)] transition hover:-translate-y-0.5",
        tone === "good" ? "bg-green-soft" : "bg-white",
      )}
    >
      <span className="flex-1">
        <span className="block text-xs font-black uppercase tracking-widest text-muted">{label}</span>
        <span className="mt-1 line-clamp-2 block font-extrabold">{text}</span>
      </span>
      <span className={cx("rounded-xl px-2.5 py-1 text-sm font-black text-white", tone === "good" ? "bg-green" : "bg-red")}>
        {delta > 0 ? "+" : "−"}
        {Math.abs(delta)}
      </span>
    </button>
  );
}

function FollowupStatus({ state, onSent }: { state: PublicSessionState; onSent: (s: PublicSessionState) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const f = state.followup!;
  if (f.sentTo) return <p className="mt-2 text-xs font-bold text-green">Sent to {f.sentTo}. Check your inbox (and spam).</p>;
  if (state.handler.enabled && !state.handler.error) return <p className="mt-2 text-xs font-bold text-muted">On its way to your inbox…</p>;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Btn
        tone="white"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            onSent((await api.sendFollowup(state.id)).state);
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Sending…" : state.handler.error ? "📨 Try sending again" : "📨 Send to my inbox"}
      </Btn>
      {(err || state.handler.error) && <span className="text-xs font-bold text-red">{err ?? state.handler.error}</span>}
    </div>
  );
}

function Missing({ message }: { message: string }) {
  return (
    <StageShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
        <Face art="custom-male" expression="suspicious" size={140} />
        <p className="text-2xl font-black">Hmm, can&apos;t find that call.</p>
        <p className="max-w-md font-bold text-white/80">{message}</p>
        <BtnLink href="/home" tone="lime">
          Back home
        </BtnLink>
      </div>
    </StageShell>
  );
}
