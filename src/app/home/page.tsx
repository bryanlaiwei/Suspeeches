"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { AppShell } from "@/components/Shells";
import { BtnLink, Face, Tag } from "@/components/ui";
import { fetchProfile } from "@/lib/client/profileStore";
import { loadSetupDraft, type SetupDraft } from "@/lib/client/storage";
import { castFor, PLAYER_ART, presetFor } from "@/lib/presets";
import type { Setup } from "@/lib/schemas";
import { CALL_MOODS } from "@/lib/scoring";

/** 04 Home: your next call. */
export default function HomePage() {
  return (
    <RequireAuth>
      <Home />
    </RequireAuth>
  );
}

function Home() {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft | null | undefined>(undefined);

  useEffect(() => {
    void fetchProfile().then((p) => {
      if (!p) return router.replace("/account");
      setDraft(loadSetupDraft());
    });
  }, [router]);

  if (draft === undefined) return <AppShell>{null}</AppShell>;
  const ready = !!draft?.callReady && !!draft.scenarioId && !!draft.claims?.length && !!draft.gap;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center">
        {ready ? <NextCall draft={draft!} /> : <NoCall hasCover={!!draft?.cover} />}
        {draft?.cover && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-lav-2 bg-white py-2 pl-2 pr-5 shadow-[0_4px_0_var(--lav-2)]">
            <Face art={PLAYER_ART} expression="happy" size={44} />
            <span className="text-sm font-extrabold">
              Playing as {draft.cover.alias} · {draft.cover.title}
            </span>
            <Link href="/cover" className="ml-2 text-sm font-black uppercase tracking-widest text-blue hover:underline">
              Edit cover
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function NextCall({ draft }: { draft: SetupDraft }) {
  const cast = castFor(draft as Setup);
  const p = presetFor(draft.scenarioId!);
  const group = cast.length > 1;
  const mood = CALL_MOODS[draft.mood ?? "sharp"];
  return (
    <>
      <h1 className="text-5xl font-black">Your next call</h1>
      <p className="mt-2 text-lg font-bold text-muted">
        {group ? "The panel is" : `${cast[0].name} is`} waiting. Check your cover, take a breath, and join.
      </p>
      <div className="mt-8 flex w-full flex-col items-center gap-6 rounded-[32px] border-2 border-lav-2 bg-white p-6 text-left shadow-[0_6px_0_var(--lav-2)] sm:flex-row">
        <div className="flex h-64 w-full shrink-0 items-center justify-center rounded-3xl sm:w-72" style={{ background: cast[0].tint }}>
          <div className={group ? "flex -space-x-8" : ""}>
            {cast.map((c) => (
              <Face key={c.name} art={c.art} expression="chill" size={group ? 110 : 200} ring={group ? "#fff" : undefined} />
            ))}
          </div>
        </div>
        <div>
          <div className="flex flex-wrap gap-2">
            <Tag color="bg-green text-white">STARTS NOW</Tag>
            <Tag color="bg-lav text-ink">{mood.label.toUpperCase()} MOOD</Tag>
          </div>
          <h2 className="mt-3 text-4xl font-black leading-tight">{p.callName.replace("A call with your character", `A call with ${cast[0].name}`)}</h2>
          <p className="mt-2 text-lg font-bold text-muted">{group ? cast.map((c) => `${c.name} (${c.title})`).join(" · ") : cast[0].title}</p>
          {draft.gap && (
            <p className="mt-1 text-sm font-bold text-muted">
              Lie size: {draft.gap.gapScore}/100 · ×{(draft.gap.multiplier * mood.scoreMultiplier).toFixed(1)} points
            </p>
          )}
          <BtnLink href="/scene" size="lg" className="mt-5">
            ▶ Join call
          </BtnLink>
        </div>
      </div>
    </>
  );
}

function NoCall({ hasCover }: { hasCover: boolean }) {
  return (
    <>
      <Face art="custom-male" expression="chill" size={160} className="mb-4" />
      <h1 className="text-5xl font-black">No calls yet</h1>
      <p className="mt-2 max-w-md text-lg font-bold text-muted">
        {hasCover ? "Your cover is ready. Now pick someone to fool." : "Build a cover story, pick someone to fool, and we'll set up the call."}
      </p>
      <BtnLink href={hasCover ? "/scenario" : "/cover"} size="lg" className="mt-6">
        {hasCover ? "Pick a scenario" : "Build my cover"} →
      </BtnLink>
    </>
  );
}
