"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/Auth";
import { StageShell } from "@/components/Shells";
import { Btn, Face, FictionNote } from "@/components/ui";
import { fetchProfile } from "@/lib/client/profileStore";
import { authEnabled } from "@/lib/client/supabase";

/** 01 Onboarding. */
export default function Onboarding() {
  const router = useRouter();
  const { user, loading } = useAuth();

  async function start() {
    if (authEnabled && !user) return router.push("/login");
    const profile = await fetchProfile();
    router.push(profile ? "/home" : "/account");
  }

  return (
    <StageShell sparkles logo={false}>
      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-10 pt-6 text-center">
        <div className="mb-8 flex items-start justify-center gap-6 sm:gap-12">
          <Face art="peer" expression="happy" size={110} ring="#d4f33a" className="mt-28 hidden bg-white sm:inline-block" />
          <Face art="recruiter" expression="happy" size={210} ring="#d4f33a" className="bg-white" />
          <div className="flex flex-col items-center gap-6">
            <Face art="custom-female" expression="chill" size={104} ring="#d4f33a" className="mt-6 bg-white" />
            <Face art="custom-male" expression="chill" size={88} ring="#d4f33a" className="ml-16 bg-white" />
          </div>
        </div>
        <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
          <span className="text-lime">Talk</span> your way
          <br />
          through
        </h1>
        <p className="mt-4 max-w-md text-lg font-bold text-white/85">
          Make up a cover story. Talk to AI characters out loud. Don&apos;t let them catch you bluffing.
        </p>
        <Btn tone="lime" size="lg" className="mt-8 min-w-64" onClick={start} disabled={loading}>
          {user ? "Keep larping" : "Start larping"} →
        </Btn>
        <div className="mt-10 select-none font-display text-[clamp(64px,15vw,220px)] font-extrabold leading-none tracking-[-0.04em]">
          <span className="text-lime">Sus</span>
          <span className="text-white">peeches</span>
        </div>
        <FictionNote onDark className="mt-6 max-w-md" />
      </div>
    </StageShell>
  );
}
