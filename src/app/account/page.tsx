"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth, SignOutButton } from "@/components/Auth";
import { Avatar } from "@/components/Avatar";
import { HeadStatus } from "@/components/CallScreen";
import { GameHistory } from "@/components/GameHistory";
import { BtnLink, Button, Card, ERROR_NOTE, FictionNote, Input, Label, Shell, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fetchProfile, storeProfile } from "@/lib/client/profileStore";
import { gapKeyFor, loadSetupDraft, saveSetupDraft } from "@/lib/client/storage";
import { authEnabled } from "@/lib/client/supabase";
import { PRESETS } from "@/lib/presets";
import { ProfileSchema } from "@/lib/schemas";

interface Form {
  name: string;
  email: string;
  role: string;
  skills: string;
  yearsExperience: string;
  education: string;
  facts: string;
}

const EMPTY: Form = { name: "", email: "", role: "", skills: "", yearsExperience: "", education: "", facts: "" };

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileForm />
    </RequireAuth>
  );
}

function ProfileForm() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [demoSus, setDemoSus] = useState(20);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchProfile().then((p) => {
      if (!p) return;
      setForm({
        name: p.name,
        email: p.email ?? "",
        role: p.role,
        skills: p.skills.join(", "),
        yearsExperience: String(p.yearsExperience),
        education: p.education,
        facts: p.facts.join("\n"),
      });
      setSaved(true);
    });
    const id = setInterval(() => setDemoSus((s) => (s >= 90 ? 10 : s + 8)), 900);
    return () => clearInterval(id);
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = ProfileSchema.safeParse({
      name: form.name,
      email: form.email,
      role: form.role,
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      yearsExperience: Number(form.yearsExperience) || 0,
      education: form.education,
      facts: form.facts.split("\n").map((s) => s.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setBusy(true);
    try {
      await storeProfile(parsed.data);
      // Saving the profile re-measures the larp gap for your saved cover story.
      const d = loadSetupDraft();
      if (d?.claims?.length) {
        const alias = d.alias || parsed.data.name;
        const { gap } = await api.gap(parsed.data, alias, d.claims);
        saveSetupDraft({ ...d, gap, gapFor: gapKeyFor(parsed.data, alias, d.claims) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      return;
    }
    router.push("/setup");
  }

  return (
    <Shell>
      <div className="grid flex-1 items-start gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="pt-4 lg:pt-10">
          <h1 className="text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl">
            Don&apos;t give
            <br />
            yourself <span className="text-red">away.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg font-bold text-muted">
            Pick a cover story. Talk your way through a conversation with an AI character who only knows your
            claims.<span className="hidden sm:inline"> A hidden judge knows the truth, and the bar above their head is watching.</span>
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-[112px_1fr] items-center gap-4 sm:grid-cols-[176px_1fr] sm:gap-6">
            <div
              className="flex flex-col items-center overflow-hidden rounded-3xl border-2 border-lav-2 pt-3 shadow-[0_5px_0_var(--lav-2)]"
              style={{ background: `${PRESETS[0].accent}26` }}
            >
              <HeadStatus value={demoSus} barClass="w-12 sm:w-24" />
              <Avatar palette={PRESETS[0]} suspicion={demoSus} className="mt-1 w-24 sm:w-36" />
            </div>
            <ol className="space-y-2">
              {[
                ["Tell us who you really are", "Who you really are"],
                ["Pick what you'll fake", "What you'll fake"],
                ["Talk. Out loud.", "Talk out loud"],
                ["Get the debrief", "Get the debrief"],
              ].map(([wide, narrow], i) => (
                <li
                  key={wide}
                  className="flex items-center gap-2.5 rounded-2xl border-2 border-lav-2 bg-white px-3 py-2 text-sm font-extrabold"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple text-xs font-black text-white">
                    {i + 1}
                  </span>
                  <span className="sm:hidden">{narrow}</span>
                  <span className="hidden sm:inline">{wide}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <Card className="lg:mt-6">
          <h2 className="text-lg font-black">Your real profile</h2>
          <p className="mb-5 text-sm font-bold text-muted">
            Fill this in once. Only the hidden judge sees it, never the characters. You can edit it any time from Profile in the top bar.
          </p>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={set("name")} placeholder="Sam Rivera" required />
            </label>
            <label className="block">
              <Label>Current role</Label>
              <Input value={form.role} onChange={set("role")} placeholder="Barista, design student" />
            </label>
            <label className="block">
              <Label>Years of experience</Label>
              <Input type="number" min={0} max={60} value={form.yearsExperience} onChange={set("yearsExperience")} placeholder="3" />
            </label>
            <label className="block sm:col-span-2">
              <Label hint="comma separated">Skills</Label>
              <Input value={form.skills} onChange={set("skills")} placeholder="latte art, Figma, customer service" />
            </label>
            <label className="block sm:col-span-2">
              <Label>Education</Label>
              <Input value={form.education} onChange={set("education")} placeholder="Second-year BFA in Graphic Design" />
            </label>
            <label className="block sm:col-span-2">
              <Label hint="one per line">A few facts about you</Label>
              <Textarea rows={3} value={form.facts} onChange={set("facts")} placeholder={"Run the weekend shift at a busy café\nBuilt two small Squarespace sites"} />
            </label>
            {error && <p className={`${ERROR_NOTE} sm:col-span-2`}>{error}</p>}
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-xs font-extrabold text-green">{saved ? "✓ Saved to your account" : ""}</span>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : saved ? "Save and play →" : "Save profile and play →"}
              </Button>
            </div>
          </form>
          <FictionNote className="mt-5" />
        </Card>
      </div>

      {authEnabled && (
        <>
          <div id="history" className="mt-14">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Your history</h2>
                <p className="text-sm font-bold text-muted">Every scene you&apos;ve played, newest first.</p>
              </div>
              <BtnLink href="/setup">Play a scene →</BtnLink>
            </div>
            <GameHistory />
          </div>
          <div className="mt-12 flex justify-center">
            <SignOutButton />
          </div>
        </>
      )}
    </Shell>
  );
}
