import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { UserMenu } from "./Auth";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------- brand ---------- */

/** Green speech bubble with suspicious eyes. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 6h32a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H20l-9 8v-8H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6Z" fill="#58cc02" />
      <path d="M8 6h32a6 6 0 0 1 6 6v3H2v-3a6 6 0 0 1 6-6Z" fill="#6fe00f" opacity=".6" />
      <circle cx="16" cy="20" r="6" fill="#fff" />
      <circle cx="32" cy="20" r="6" fill="#fff" />
      <circle cx="18" cy="21" r="3" fill="#2b2a5c" />
      <circle cx="34" cy="21" r="3" fill="#2b2a5c" />
      <path d="M10 12.5 21 15M38 12.5 27 15" stroke="#2b2a5c" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** "Suspeeches" wordmark. `onDark` for purple backgrounds. */
export function Logo({ onDark = false, href = "/", className = "" }: { onDark?: boolean; href?: string; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-2 text-[26px] font-black tracking-tight", className)}>
      <LogoMark />
      <span>
        <span className={onDark ? "text-yellow" : "text-green"}>Sus</span>
        <span className={onDark ? "text-white" : "text-ink"}>peeches</span>
      </span>
    </Link>
  );
}

/* ---------- buttons ---------- */

type Tone = "green" | "white" | "blue" | "red" | "yellow" | "purple" | "lime" | "ghost";
const TONES: Record<Tone, string> = {
  green: "bg-green text-white shadow-[0_4px_0_var(--green-dark)] hover:brightness-105",
  white: "bg-white text-blue border-2 border-lav-2 shadow-[0_4px_0_var(--lav-2)] hover:bg-panel-2",
  blue: "bg-blue text-white shadow-[0_4px_0_var(--blue-dark)] hover:brightness-105",
  red: "bg-red text-white shadow-[0_4px_0_var(--red-dark)] hover:brightness-105",
  yellow: "bg-yellow text-ink shadow-[0_4px_0_var(--yellow-dark)] hover:brightness-105",
  purple: "bg-purple text-white shadow-[0_4px_0_var(--purple-deep)] hover:brightness-105",
  lime: "bg-lime text-ink shadow-[0_4px_0_#a9c41e] hover:brightness-105",
  ghost: "text-muted hover:text-ink",
};

const BTN_BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-2xl font-extrabold uppercase tracking-wider transition active:translate-y-[3px] active:shadow-none";
const BTN_SIZE = { sm: "px-4 py-2 text-xs", md: "px-6 py-3 text-sm", lg: "px-8 py-4 text-base" } as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: keyof typeof BTN_SIZE };
/** Chunky "3D" button that sinks when pressed. */
export function Btn({ tone = "green", size = "md", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        BTN_BASE,
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
        BTN_SIZE[size],
        TONES[tone],
        className,
      )}
    />
  );
}

/** A link styled like Btn. */
export function BtnLink({
  href,
  tone = "green",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  tone?: Tone;
  size?: keyof typeof BTN_SIZE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(BTN_BASE, BTN_SIZE[size], TONES[tone], className)}>
      {children}
    </Link>
  );
}

/** Classic button API used across the pages, drawn as a 3D Btn. */
export function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "subtle" }) {
  const tone = ({ primary: "green", ghost: "white", danger: "red", subtle: "ghost" } as const)[variant];
  return <Btn tone={tone} size={variant === "subtle" ? "sm" : "md"} {...props} />;
}

/** Page frame: logo, step pills and the account menu on top. */
export function Shell({ children, step }: { children: ReactNode; step?: 1 | 2 | 3 }) {
  const steps = ["Cover story", "Scene", "Debrief"];
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b-2 border-lav-2 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-5">
            {step && (
              <ol className="hidden items-center gap-2 text-xs font-black uppercase tracking-widest sm:flex">
                {steps.map((label, i) => (
                  <li
                    key={label}
                    className={cx(
                      "rounded-xl border-2 px-3 py-1.5",
                      i + 1 === step
                        ? "border-blue bg-blue-soft text-blue"
                        : i + 1 < step
                          ? "border-green bg-green-soft text-green"
                          : "border-lav-2 text-muted",
                    )}
                  >
                    {i + 1}. {label}
                  </li>
                ))}
              </ol>
            )}
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-16 pt-8 sm:px-6">{children}</div>
    </div>
  );
}

/* ---------- surfaces ---------- */

export function Card({ children, className = "", selected = false }: { children: ReactNode; className?: string; selected?: boolean }) {
  return (
    <section
      className={cx(
        "rounded-3xl border-2 bg-white p-5",
        selected ? "border-green shadow-[0_5px_0_var(--green-dark)]" : "border-lav-2 shadow-[0_5px_0_var(--lav-2)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Toggle chip (years, skills, goals, mood). */
export function Chip({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-2xl border-2 px-4 py-2.5 text-sm font-extrabold transition active:translate-y-[2px]",
        selected
          ? "border-blue bg-blue-soft text-blue shadow-[0_3px_0_var(--blue)]"
          : "border-lav-2 bg-white text-ink shadow-[0_3px_0_var(--lav-2)] hover:bg-panel-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

const TAG_COLORS: Record<string, string> = {
  EASY: "bg-green text-white",
  MEDIUM: "bg-yellow text-ink",
  HARD: "bg-red text-white",
  CUSTOM: "bg-pink text-ink",
};
export function Tag({ children, color }: { children: ReactNode; color?: string }) {
  const key = String(children);
  return (
    <span className={cx("inline-block rounded-lg px-2.5 py-1 text-[11px] font-black tracking-widest", color ?? TAG_COLORS[key] ?? "bg-lav-2 text-ink")}>
      {children}
    </span>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-2 flex items-baseline justify-between gap-2 text-xs font-extrabold uppercase tracking-widest text-muted">
      {children}
      {hint && <span className="text-[11px] font-bold normal-case tracking-normal text-muted/80">{hint}</span>}
    </span>
  );
}

const field =
  "w-full rounded-2xl border-2 border-lav-2 bg-white px-4 py-3 text-base font-bold text-ink placeholder:font-semibold placeholder:text-muted/60 outline-none focus:border-blue";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(field, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(field, props.className)} />;
}

/** Speech bubble; `tail` points down (NPC) or up (you). */
export function Bubble({
  children,
  tone = "white",
  tail = "down",
  className = "",
}: {
  children: ReactNode;
  tone?: "white" | "green" | "lav";
  tail?: "down" | "up" | "none";
  className?: string;
}) {
  const bg = tone === "green" ? "var(--green)" : tone === "lav" ? "var(--lav)" : "#fff";
  return (
    <div
      className={cx(
        "relative rounded-3xl px-6 py-4 text-center text-lg font-extrabold leading-snug",
        tone === "green" ? "text-white shadow-[0_4px_0_var(--green-dark)]" : "text-ink shadow-[0_4px_0_var(--lav-2)]",
        className,
      )}
      style={{ background: bg }}
    >
      {children}
      {tail !== "none" && (
        <span
          className="absolute left-1/2 h-4 w-4 -translate-x-1/2 rotate-45"
          style={{ background: bg, [tail === "down" ? "bottom" : "top"]: -8 }}
        />
      )}
    </div>
  );
}

export function FictionNote({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <p className={cx("text-xs font-semibold leading-relaxed", onDark ? "text-white/70" : "text-muted", className)}>
      Everyone you&apos;ll meet here is made up, and so is the job. Practice and fun only. Please don&apos;t larp on real
      people. 🙏
    </p>
  );
}

export function suspicionColor(v: number): string {
  if (v < 40) return "var(--green)";
  if (v < 70) return "var(--yellow)";
  return "var(--red)";
}

/** Sparkle decoration for purple screens. */
export function Sparkle({ className = "", color = "#d4f33a", size = 28 }: { className?: string; color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cx("animate-sus-twinkle absolute", className)} aria-hidden>
      <path d="M12 0c1 6 6 11 12 12-6 1-11 6-12 12-1-6-6-11-12-12 6-1 11-6 12-12Z" fill={color} />
    </svg>
  );
}
