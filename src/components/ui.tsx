import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={cx("group inline-flex items-center gap-2 font-black tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="#1b1b29" stroke="#ff3b5c" strokeWidth="2" />
        <path d="M7 17c3-5 15-5 18 0" fill="none" stroke="#f3f1ff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="20" cy="16.5" r="2.6" fill="#ff3b5c" className="transition-transform group-hover:translate-x-[-6px]" />
      </svg>
      <span className="text-xl">Sus</span>
    </Link>
  );
}

export function Shell({ children, step }: { children: ReactNode; step?: 1 | 2 | 3 | 4 }) {
  const steps = ["Profile", "Cover story", "Scene", "Debrief"];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        {step && (
          <ol className="hidden items-center gap-2 text-xs text-muted sm:flex">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={cx(
                    "rounded-full px-2.5 py-1",
                    i + 1 === step ? "bg-brand/20 text-ink ring-1 ring-brand/50" : i + 1 < step ? "text-ink/70" : "",
                  )}
                >
                  {i + 1}. {s}
                </span>
                {i < steps.length - 1 && <span className="text-line">—</span>}
              </li>
            ))}
          </ol>
        )}
      </header>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-panel/80 p-5 backdrop-blur", className)}>{children}</section>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "subtle" };
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand text-white shadow-[0_0_24px_-6px] shadow-brand hover:brightness-110",
        variant === "danger" && "bg-sus text-white hover:brightness-110",
        variant === "ghost" && "border border-line text-ink hover:bg-panel-2",
        variant === "subtle" && "text-muted hover:text-ink",
        className,
      )}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-ink/90">
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </span>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-xl border border-line bg-bg/60 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30",
        props.className,
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-xl border border-line bg-bg/60 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30",
        props.className,
      )}
    />
  );
}

export function FictionNote({ className = "" }: { className?: string }) {
  return (
    <p className={cx("rounded-xl border border-line bg-panel-2/60 px-4 py-3 text-xs leading-relaxed text-muted", className)}>
      <strong className="text-ink/80">Heads up:</strong> every character in Sus is fictional, and the app is for
      practice and entertainment only. Don&apos;t use it to deceive real people.
    </p>
  );
}

export function suspicionColor(v: number): string {
  if (v < 40) return "var(--clean)";
  if (v < 70) return "var(--warn)";
  return "var(--sus)";
}
