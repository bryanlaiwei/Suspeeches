"use client";

import { useState } from "react";
import { fmtTime } from "@/lib/context";
import { playerArt, type CastMember } from "@/lib/presets";
import type { EndReason } from "@/lib/types";
import { StageShell } from "./Shells";
import { Btn, Bubble, cx, Face, Input } from "./ui";
import { useAnimatedNumber } from "./useAnimatedNumber";

/* ---------- 07: live call ---------- */

/** Vertical "SUSPICION" meter: 10 blocks, green → yellow → red, with a "62% SUS" tag. */
export function SusMeter({ value, pop }: { value: number; pop: { delta: number; key: number } | null }) {
  const v = Math.max(0, Math.min(100, value));
  const lit = Math.round(v / 10);
  const blockColor = (i: number) => (i < 4 ? "var(--green)" : i < 7 ? "var(--yellow)" : "var(--red)");
  return (
    <div className="flex flex-col items-start" aria-label={`Suspicion ${Math.round(v)} percent`} role="meter" aria-valuenow={Math.round(v)}>
      <span className="mb-2 text-xs font-black tracking-widest text-white">SUSPICION</span>
      <div className="relative flex flex-col-reverse gap-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="h-8 w-20 rounded-xl transition-colors duration-300"
            style={{ background: i < lit ? blockColor(i) : "rgba(43,42,92,0.22)" }}
          />
        ))}
        <div
          className="absolute left-full ml-3 flex items-center transition-all duration-500"
          style={{ bottom: `calc(${Math.max(lit - 1, 0) * 10}% + 2px)` }}
        >
          <span className="relative rounded-2xl bg-white px-4 py-2 text-ink shadow-[0_3px_0_var(--lav-2)]">
            <span className="text-xl font-black tabular-nums">{Math.round(v)}%</span>
            <span className="ml-1.5 text-xs font-black tracking-widest text-muted">SUS</span>
            {pop && pop.delta !== 0 && (
              <span
                key={pop.key}
                className="animate-sus-float absolute -top-6 right-1 text-base font-black"
                style={{ color: pop.delta > 0 ? "var(--red)" : "var(--lime)" }}
              >
                {pop.delta > 0 ? "+" : ""}
                {pop.delta}
              </span>
            )}
          </span>
        </div>
      </div>
      <span className="mt-2 text-xs font-black tracking-widest text-green">CHILL</span>
    </div>
  );
}

export function TimerCard({ remaining }: { remaining: number }) {
  const low = remaining < 30;
  return (
    <div
      className={cx(
        "rounded-3xl px-6 py-3 shadow-[0_5px_0_rgba(0,0,0,0.15)] transition-colors",
        low ? "bg-red text-white" : "bg-yellow text-ink",
      )}
      aria-label="Time left"
    >
      <span className="block text-xs font-black tracking-widest">TIME LEFT</span>
      <span className="flex items-center gap-3 text-5xl font-black tabular-nums">
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {fmtTime(remaining)}
      </span>
    </div>
  );
}

/** One person on the call: big circle (1-on-1) or one of a row (group), with their own mini meter. */
function OnCall({
  member,
  suspicion,
  talking,
  dimmed,
  size,
  showMeter,
}: {
  member: CastMember;
  suspicion: number;
  talking: boolean;
  dimmed: boolean;
  size: number;
  showMeter: boolean;
}) {
  const shown = useAnimatedNumber(suspicion, 5);
  return (
    <div className={cx("flex flex-col items-center transition duration-300", dimmed && "scale-95 opacity-70")}>
      <div className="rounded-full p-4" style={{ background: "rgba(255,255,255,0.22)" }}>
        <Face art={member.art} suspicion={shown} size={size} talking={talking} ring={talking ? "#d4f33a" : undefined} />
      </div>
      {showMeter && (
        <div className="mt-2 w-32 text-center">
          <div className="text-sm font-black text-white">
            {member.name} <span className="font-bold text-white/70">· {member.title}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-[rgba(43,42,92,0.25)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, shown))}%`, background: shown < 40 ? "var(--green)" : shown < 70 ? "var(--yellow)" : "var(--red)" }}
            />
          </div>
          <div className="mt-0.5 text-xs font-black tabular-nums text-white">{Math.round(shown)}% sus</div>
        </div>
      )}
    </div>
  );
}

export function CallStage({
  cast,
  suspicion,
  suspicionBy,
  active,
  npcLine,
  npcSpeaker,
  userLine,
  userTalking,
  remaining,
  pop,
  shaking,
  status,
  muted,
  onMute,
  onHangUp,
  mockInput,
}: {
  cast: CastMember[];
  suspicion: number;
  suspicionBy: Record<string, number> | null;
  active: string | null;
  npcLine: string | null;
  npcSpeaker: string | null;
  userLine: string | null;
  userTalking: boolean;
  remaining: number;
  pop: { delta: number; key: number } | null;
  shaking: boolean;
  /** Small status line under the people ("Sam is waiting… 3s", "Connecting…"). */
  status: { text: string; tone: "warn" | "red" | "soft" } | null;
  muted: boolean | null;
  onMute: () => void;
  onHangUp: () => void;
  mockInput: React.ReactNode;
}) {
  const group = cast.length > 1;
  return (
    <StageShell right={<TimerCard remaining={remaining} />}>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 gap-4 px-6 md:px-10">
          {/* meter */}
          <div className="hidden pt-4 sm:block">
            <SusMeter value={suspicion} pop={pop} />
            {group && <p className="mt-3 w-24 text-[11px] font-bold leading-tight text-white/70">Shows whoever is most suspicious</p>}
          </div>

          {/* people + their latest line */}
          <div className={cx("flex flex-1 flex-col items-center", shaking && "animate-sus-shake")}>
            <div className="min-h-[96px] w-full max-w-2xl">
              {npcLine && (
                <Bubble key={npcLine} className="animate-sus-pop">
                  {group && npcSpeaker && <span className="mb-1 block text-xs font-black uppercase tracking-widest text-purple">{npcSpeaker}</span>}
                  {npcLine}
                </Bubble>
              )}
            </div>
            <div className={cx("mt-6 flex items-end justify-center", group ? "gap-6" : "")}>
              {cast.map((c) => (
                <OnCall
                  key={c.name}
                  member={c}
                  suspicion={suspicionBy?.[c.name] ?? suspicion}
                  talking={active === c.name}
                  dimmed={group && !!active && active !== c.name}
                  size={group ? 150 : 260}
                  showMeter={group}
                />
              ))}
            </div>
            {status && (
              <span
                className={cx(
                  "mt-4 rounded-full px-4 py-1.5 text-sm font-black",
                  status.tone === "warn" && "animate-pulse bg-yellow text-ink",
                  status.tone === "red" && "animate-pulse bg-red text-white",
                  status.tone === "soft" && "bg-white/20 text-white",
                )}
              >
                {status.text}
              </span>
            )}
          </div>
          <div className="hidden w-24 sm:block" />
        </div>

        {/* the desk */}
        <div className="relative mt-6">
          <div className="mx-auto h-10 max-w-6xl rounded-t-[40px] bg-orange shadow-[inset_0_-10px_0_var(--orange-dark)]" />
          <div className="mx-auto max-w-5xl bg-[#e07b00] px-6 pb-8 pt-6">
            <div className="mx-auto flex max-w-3xl items-start gap-4">
              <div className="flex flex-col items-center">
                <Face art={playerArt(cast)} expression="chill" size={68} ring="#fff" talking={userTalking} />
                <span className="mt-1 text-xs font-black tracking-widest text-white">YOU</span>
              </div>
              <div className="flex-1 pt-2">
                {userLine || userTalking ? (
                  <Bubble key={userLine ?? "talking"} tone="green" tail="up" className="animate-sus-pop">
                    {userLine && !userTalking ? userLine : "…"}
                  </Bubble>
                ) : (
                  <p className="pt-4 text-center text-sm font-bold text-white/80">Your turn. Talk like you totally did all of that. 😎</p>
                )}
              </div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-5">
              {muted !== null && (
                <RoundBtn label={muted ? "Unmute" : "Mute"} onClick={onMute} active={muted}>
                  {muted ? (
                    <path d="M9 9v3a3 3 0 0 0 5 2M15 10V5a3 3 0 0 0-6 0M5 11a7 7 0 0 0 11 5.7M19 11a7 7 0 0 1-.5 2.6M12 18v3M3 3l18 18" />
                  ) : (
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />
                  )}
                </RoundBtn>
              )}
              <button
                type="button"
                onClick={onHangUp}
                aria-label="Hang up"
                className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-red text-white shadow-[0_5px_0_var(--red-dark)] transition active:translate-y-1 active:shadow-none"
              >
                <svg viewBox="0 0 24 24" className="h-9 w-9" fill="currentColor">
                  <path d="M3 14.5c4.9-4.7 13.1-4.7 18 0l-2.5 2.8-3.4-1.5v-2.4a10.4 10.4 0 0 0-6.2 0v2.4l-3.4 1.5L3 14.5Z" />
                </svg>
              </button>
            </div>
            {mockInput}
          </div>
        </div>
      </div>
    </StageShell>
  );
}

function RoundBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "flex h-16 w-16 items-center justify-center rounded-full shadow-[0_5px_0_var(--lav-2)] transition active:translate-y-1 active:shadow-none",
        active ? "bg-blue-soft text-blue" : "bg-white text-ink",
      )}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

/* ---------- end of call ---------- */

export function EndOverlay({ reason, npcName }: { reason: EndReason; npcName: string }) {
  const caught = reason === "caught";
  const title = caught ? "BUSTED!" : reason === "left" ? "YOU HUNG UP" : reason === "error" ? "CALL DROPPED" : "TIME'S UP!";
  const sub = caught
    ? `${npcName} saw right through you. 👀`
    : reason === "left"
      ? "Bold move. Let's see how it looked from their side."
      : reason === "timeout"
        ? "You made it to the end without blowing your cover."
        : "The line went dead. Let's see what we've got.";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-purple/90 backdrop-blur-sm">
      <div className="animate-sus-pop text-center">
        <div className={cx("font-display text-7xl font-extrabold tracking-tight sm:text-8xl", caught ? "text-red" : "text-lime")}>{title}</div>
        <p className="mt-3 text-xl font-extrabold text-white">{sub}</p>
        <p className="mt-6 text-sm font-bold text-white/70">Crunching the numbers…</p>
      </div>
    </div>
  );
}

/** MOCK_MODE dev aid: type instead of talking. */
export function MockInput({ onSend, onTyping }: { onSend: (text: string) => void; onTyping: () => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mx-auto mt-5 flex max-w-xl gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text.trim());
        setText("");
      }}
    >
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTyping();
        }}
        placeholder="MOCK_MODE: type what you'd say…"
      />
      <Btn type="submit" tone="white">
        Say
      </Btn>
    </form>
  );
}
