"use client";

import type { CastMember } from "@/lib/presets";
import { Avatar } from "./Avatar";
import { cx } from "./ui";

/** The NPC(s) on stage. One big face for 1-on-1 scenes, a row of faces for groups. */
export function Stage({
  cast,
  active,
  suspicion,
  getLevel,
  shaking,
}: {
  cast: CastMember[];
  /** Name of whoever is speaking right now (groups). */
  active: string | null;
  suspicion: number;
  getLevel: (name: string) => number;
  shaking: boolean;
}) {
  if (cast.length === 1) {
    const c = cast[0];
    return (
      <>
        <div className={cx("relative mt-2 w-full max-w-[300px]", shaking && "animate-sus-shake")}>
          <Avatar palette={c} suspicion={suspicion} getLevel={() => getLevel(c.name)} className="w-full drop-shadow-2xl" />
        </div>
        <div className="mt-1 text-center">
          <div className="text-xl font-bold">{c.name}</div>
          <div className="text-sm text-muted">{c.title}</div>
        </div>
      </>
    );
  }
  return (
    <div className={cx("mt-4 grid w-full max-w-xl gap-2", cast.length === 3 ? "grid-cols-3" : "grid-cols-2", shaking && "animate-sus-shake")}>
      {cast.map((c) => {
        const speaking = active === c.name;
        return (
          <div key={c.name} className="flex flex-col items-center">
            <div
              className={cx(
                "w-full max-w-[170px] rounded-full transition duration-300",
                speaking ? "scale-105 opacity-100" : active ? "scale-95 opacity-60" : "opacity-90",
              )}
            >
              <Avatar palette={c} suspicion={suspicion} getLevel={() => getLevel(c.name)} className="w-full" />
            </div>
            <div className={cx("mt-1 text-center transition", speaking ? "text-ink" : "text-muted")}>
              <div className="flex items-center justify-center gap-1.5 font-bold">
                {speaking && <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />}
                {c.name}
              </div>
              <div className="text-xs">{c.title}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
