"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authEnabled, supabase } from "@/lib/client/supabase";
import { useInbox } from "@/lib/client/inbox";
import { cx, Logo, Sparkle } from "./ui";

const NAV = [
  { href: "/home", label: "Home", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z" },
  { href: "/messages", label: "Messages", icon: "M4 5h16v11H9l-5 4V5Z" },
  { href: "/account", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0" },
];

/** Lavender app with the left sidebar (Home, Messages, Profile). */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const inbox = useInbox();
  const unread = inbox?.filter((i) => i.unread).length ?? 0;
  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-2 border-lav-2 bg-white px-4 py-6 md:w-64 md:border-r-2">
        <Logo href="/home" className="mb-6 px-2" />
        <nav className="flex gap-2 md:flex-col">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-black uppercase tracking-widest transition",
                  active ? "border-blue bg-blue-soft text-blue" : "border-transparent text-muted hover:bg-panel-2",
                )}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
                  <path d={n.icon} />
                </svg>
                <span className="flex-1">{n.label}</span>
                {n.href === "/messages" && unread > 0 && (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red px-1.5 text-xs text-white">{unread}</span>
                )}
              </Link>
            );
          })}
        </nav>
        {authEnabled && (
          <button
            type="button"
            className="mt-auto hidden rounded-2xl px-4 py-2 text-left text-xs font-extrabold uppercase tracking-widest text-muted/70 hover:text-ink md:block"
            onClick={async () => {
              await supabase()?.auth.signOut();
              router.replace("/");
            }}
          >
            Sign out
          </button>
        )}
      </aside>
      <main className="flex flex-1 flex-col px-5 py-10 md:px-12">{children}</main>
    </div>
  );
}

/** Full-bleed purple "stage" (onboarding, scenario picker, calls, results). */
export function StageShell({
  children,
  right,
  sparkles = false,
  logo = true,
}: {
  children: ReactNode;
  right?: ReactNode;
  sparkles?: boolean;
  logo?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen flex-1 flex-col overflow-hidden bg-purple text-white">
      {sparkles && (
        <>
          <Sparkle className="left-[12%] top-[14%]" color="#ff86d0" />
          <Sparkle className="left-[36%] top-[9%]" size={36} />
          <Sparkle className="right-[22%] top-[11%]" color="#ff86d0" />
          <Sparkle className="right-[9%] top-[25%]" size={22} />
          <Sparkle className="left-[18%] top-[35%]" color="#ffffff" size={22} />
        </>
      )}
      {(logo || right) && (
        <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
          {logo ? <Logo onDark href="/home" /> : <span />}
          {right}
        </header>
      )}
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Light lavender page with a progress bar on top and an action bar at the bottom ("Build your cover"). */
export function StepShell({
  children,
  progress,
  onClose,
  footer,
}: {
  children: ReactNode;
  progress: number;
  onClose: () => void;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-lav">
      <header className="flex items-center gap-6 px-6 py-6 md:px-16">
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M5 5l14 14M19 5 5 19" />
          </svg>
        </button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-lav-2">
          <div className="h-full rounded-full bg-green transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </header>
      <div className="flex flex-1 justify-center px-5 pb-10">{children}</div>
      <footer className="sticky bottom-0 border-t-2 border-lav-2 bg-white px-6 py-5 md:px-16">
        <div className="flex items-center justify-between gap-4">{footer}</div>
      </footer>
    </div>
  );
}
