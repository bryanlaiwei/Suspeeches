"use client";

import type { ReactNode } from "react";
import { Logo, Sparkle } from "./ui";

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
