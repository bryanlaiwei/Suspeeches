"use client";

import { useState } from "react";
import { fmtTime } from "@/lib/context";
import type { CastMember } from "@/lib/presets";
import { moodFor } from "@/lib/scoring";
import type { EndReason } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Btn, cx, Input, MOOD_STYLE } from "./ui";
import { useAnimatedNumber } from "./useAnimatedNumber";

/* ---------- live call: a light video-call grid ---------- */

const TILE = "relative flex min-h-0 flex-col items-center overflow-hidden rounded-3xl border-2 transition";
const TILE_IDLE = "border-lav-2 shadow-[0_5px_0_var(--lav-2)]";
const TILE_TALKING = "border-green shadow-[0_5px_0_var(--green-dark)]";

function NameTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-xl bg-white px-3 py-1 text-sm font-extrabold text-ink shadow-[0_2px_0_var(--lav-2)]">
      {children}
    </span>
  );
}

/** Status chip + bar + percent that sits over a character's head (call page, profile demo). */
export function HeadStatus({
  value,
  pop = null,
  barClass = "w-28",
  className = "",
}: {
  value: number;
  pop?: { delta: number; key: number } | null;
  barClass?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const st = MOOD_STYLE[moodFor(v)];
  return (
    <div className={cx("flex flex-col items-center gap-1.5", className)}>
      <span key={st.label} className={cx("animate-sus-pop rounded-full px-3 py-0.5 text-xs font-black", st.chip)}>
        {st.label}
      </span>
      <div className="relative flex items-center gap-2">
        <div className={cx("h-3 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_2px_var(--lav-2)]", barClass)}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${v}%`, background: st.bar }} />
        </div>
        <span className={cx("w-10 text-sm font-black tabular-nums", st.text)}>{v}%</span>
        {pop && pop.delta !== 0 && (
          <span
            key={pop.key}
            className="animate-sus-float absolute -right-6 -top-4 text-base font-black"
            style={{ color: pop.delta > 0 ? "var(--red)" : "var(--green)" }}
          >
            {pop.delta > 0 ? "+" : ""}
            {pop.delta}
          </span>
        )}
      </div>
    </div>
  );
}

/** One character's video tile: status + bar over their head, their face, a name tag. */
function PersonTile({
  member,
  suspicion,
  pop,
  talking,
  big,
  getLevel,
}: {
  member: CastMember;
  suspicion: number;
  pop: { delta: number; key: number } | null;
  talking: boolean;
  big: boolean;
  getLevel: () => number;
}) {
  const shown = useAnimatedNumber(suspicion, 5);
  const v = Math.max(0, Math.min(100, Math.round(shown)));
  return (
    <div className={cx(TILE, talking ? TILE_TALKING : TILE_IDLE)} style={{ background: `${member.accent}26` }}>
      <HeadStatus value={v} pop={pop} barClass={big ? "w-40" : "w-28"} className="z-10 pt-3" />
      <div className="relative min-h-0 w-full flex-1">
        <Avatar palette={member} suspicion={shown} getLevel={getLevel} speaking={talking} className="absolute inset-x-0 bottom-0 mx-auto h-full w-auto" />
      </div>
      <NameTag>
        {member.name} <span className="font-bold text-muted">· {member.title}</span>
      </NameTag>
    </div>
  );
}

function MicIcon({ off = false, className = "h-5 w-5" }: { off?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <path d="M9 9v3a3 3 0 0 0 5 2M15 10V5a3 3 0 0 0-6 0M5 11a7 7 0 0 0 11 5.7M19 11a7 7 0 0 1-.5 2.6M12 18v3M3 3l18 18" />
      ) : (
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />
      )}
    </svg>
  );
}

/** Your own tile: camera off, initials, mic state. */
function YouTile({ you, talking, muted }: { you: string; talking: boolean; muted: boolean }) {
  const initials =
    you
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <div className={cx(TILE, "justify-center bg-green-soft", talking ? TILE_TALKING : TILE_IDLE)}>
      <span
        className={cx(
          "flex h-20 w-20 items-center justify-center rounded-full bg-green text-2xl font-black text-white shadow-[0_4px_0_var(--green-dark)] transition",
          talking && "animate-sus-bob ring-4 ring-lime",
        )}
      >
        {initials}
      </span>
      <NameTag>
        <MicIcon off={muted} className={cx("h-4 w-4", muted ? "text-red" : "text-green")} />
        You <span className="font-bold text-muted">· {you}</span>
      </NameTag>
    </div>
  );
}

export function CallStage({
  title,
  you,
  cast,
  suspicion,
  suspicionBy,
  active,
  userTalking,
  remaining,
  pop,
  getLevel,
  shaking,
  status,
  muted,
  onMute,
  onHangUp,
  mockInput,
}: {
  /** Call name in the top bar ("Startup interview", "Recruiter screen · Dana"). */
  title: string;
  /** The player's alias. */
  you: string;
  cast: CastMember[];
  suspicion: number;
  suspicionBy: Record<string, number> | null;
  active: string | null;
  userTalking: boolean;
  remaining: number;
  /** Latest change: overall delta plus each character's own (groups). */
  pop: { delta: number; key: number; by?: Record<string, number> } | null;
  getLevel: (name: string) => number;
  shaking: boolean;
  /** Small status line ("Dana is waiting… 3s", "Calling…"). */
  status: { text: string; tone: "warn" | "red" | "soft" } | null;
  muted: boolean | null;
  onMute: () => void;
  onHangUp: () => void;
  mockInput: React.ReactNode;
}) {
  const group = cast.length > 1;
  const low = remaining < 30;
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-lav px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        {/* top bar */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red" />
            <span className="truncate">{title}</span>
          </span>
          <span
            className={cx(
              "shrink-0 rounded-xl px-3 py-1 text-sm font-black tabular-nums transition-colors",
              low ? "bg-red text-white shadow-[0_3px_0_var(--red-dark)]" : "bg-yellow text-ink shadow-[0_3px_0_var(--yellow-dark)]",
            )}
            aria-label="Time left"
          >
            {fmtTime(remaining)} left
          </span>
        </div>

        {/* video grid */}
        <div
          className={cx(
            "grid min-h-[420px] flex-1 gap-3",
            group ? (cast.length === 2 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 sm:grid-rows-2") : "grid-cols-1 sm:grid-cols-[2fr_1fr]",
            shaking && "animate-sus-shake",
          )}
        >
          {cast.map((c) => (
            <PersonTile
              key={c.name}
              member={c}
              suspicion={suspicionBy?.[c.name] ?? suspicion}
              pop={pop ? { key: pop.key, delta: pop.by?.[c.name] ?? pop.delta } : null}
              talking={active === c.name}
              big={!group}
              getLevel={() => getLevel(c.name)}
            />
          ))}
          <YouTile you={you} talking={userTalking} muted={!!muted} />
        </div>

        {/* status only: no lines from the conversation are shown during the call */}
        <div className="mt-4 flex min-h-[40px] flex-col items-center justify-center gap-2">
          {status && (
            <span
              className={cx(
                "rounded-full px-4 py-1 text-sm font-black",
                status.tone === "warn" && "animate-pulse bg-yellow text-ink",
                status.tone === "red" && "animate-pulse bg-red text-white",
                status.tone === "soft" && "bg-white text-muted",
              )}
            >
              {status.text}
            </span>
          )}
        </div>

        {/* controls */}
        <div className="mt-3 flex items-center justify-center gap-4">
          {muted !== null && (
            <button
              type="button"
              onClick={onMute}
              aria-label={muted ? "Unmute" : "Mute"}
              title={muted ? "Unmute" : "Mute"}
              className={cx(
                "flex h-14 w-14 items-center justify-center rounded-full shadow-[0_4px_0_var(--lav-2)] transition active:translate-y-1 active:shadow-none",
                muted ? "bg-red text-white" : "bg-white text-purple",
              )}
            >
              <MicIcon off={muted} className="h-6 w-6" />
            </button>
          )}
          <button
            type="button"
            onClick={onHangUp}
            aria-label="Hang up"
            title="Hang up"
            className="flex h-14 w-24 items-center justify-center rounded-full bg-red text-white shadow-[0_4px_0_var(--red-dark)] transition active:translate-y-1 active:shadow-none"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
              <path d="M3 14.5c4.9-4.7 13.1-4.7 18 0l-2.5 2.8-3.4-1.5v-2.4a10.4 10.4 0 0 0-6.2 0v2.4l-3.4 1.5L3 14.5Z" />
            </svg>
          </button>
        </div>
        {mockInput}
      </div>
    </div>
  );
}

/* ---------- end of call ---------- */

export function EndOverlay({ reason, npcName, lastLine = null }: { reason: EndReason; npcName: string; lastLine?: string | null }) {
  const caught = reason === "caught";
  const title = caught ? "BUSTED!" : reason === "left" ? "YOU HUNG UP" : reason === "timeout" ? "TIME'S UP!" : "CALL DROPPED";
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
        {lastLine && (
          <p className="mx-auto mt-5 max-w-xl rounded-2xl bg-white px-5 py-3 text-lg font-extrabold text-ink shadow-[0_4px_0_rgba(0,0,0,0.15)]">
            <span className="text-purple">{npcName}:</span> &ldquo;{lastLine}&rdquo;
          </p>
        )}
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
