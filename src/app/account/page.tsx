"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { AppShell } from "@/components/Shells";
import { Btn, Card, Face, Input, Label, Textarea } from "@/components/ui";
import { fetchProfile, storeProfile } from "@/lib/client/profileStore";
import { loadSetupDraft } from "@/lib/client/storage";
import { supabase } from "@/lib/client/supabase";
import { fmtTime } from "@/lib/context";
import { PLAYER_ART } from "@/lib/presets";
import { ProfileSchema } from "@/lib/schemas";

interface Form {
  name: string;
  role: string;
  skills: string;
  yearsExperience: string;
  education: string;
  facts: string;
}
const EMPTY: Form = { name: "", role: "", skills: "", yearsExperience: "", education: "", facts: "" };

/** Profile: the REAL you (only the judge sees it) + your past calls. */
export default function AccountPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full max-w-3xl pt-4">
          <ProfileForm />
          <PastCalls />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function ProfileForm() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"new" | "saved" | "dirty">("new");

  useEffect(() => {
    void fetchProfile().then((p) => {
      if (!p) return;
      setForm({
        name: p.name,
        role: p.role,
        skills: p.skills.join(", "),
        yearsExperience: String(p.yearsExperience),
        education: p.education,
        facts: p.facts.join("\n"),
      });
      setSaved("saved");
    });
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved((s) => (s === "new" ? "new" : "dirty"));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const first = saved === "new";
    const parsed = ProfileSchema.safeParse({
      name: form.name,
      role: form.role,
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      yearsExperience: Number(form.yearsExperience) || 0,
      education: form.education,
      facts: form.facts.split("\n").map((s) => s.trim()).filter(Boolean),
    });
    if (!parsed.success) return setError("Give us at least your name. The judge needs something to work with.");
    try {
      await storeProfile(parsed.data);
    } catch (err) {
      return setError(err instanceof Error ? err.message : String(err));
    }
    setError(null);
    setSaved("saved");
    if (first) router.push(loadSetupDraft()?.cover ? "/home" : "/cover");
  }

  return (
    <>
      <div className="flex items-center gap-5">
        <Face art={PLAYER_ART} expression="happy" size={96} />
        <div>
          <h1 className="text-4xl font-black leading-tight">The real you</h1>
          <p className="font-bold text-muted">
            Only the hidden judge sees this, never the characters. It&apos;s how they know when you&apos;re stretching the truth. 🕵️
          </p>
        </div>
      </div>
      <Card className="mt-6">
        <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <Label>Name</Label>
            <Input value={form.name} onChange={set("name")} placeholder="Alex Rivera" required />
          </label>
          <label className="block">
            <Label>What you actually do</Label>
            <Input value={form.role} onChange={set("role")} placeholder="Junior backend developer" />
          </label>
          <label className="block">
            <Label>Years of experience</Label>
            <Input type="number" min={0} max={60} value={form.yearsExperience} onChange={set("yearsExperience")} placeholder="2" />
          </label>
          <label className="block">
            <Label>Education</Label>
            <Input value={form.education} onChange={set("education")} placeholder="BS Computer Science" />
          </label>
          <label className="block sm:col-span-2">
            <Label hint="comma separated">Real skills</Label>
            <Input value={form.skills} onChange={set("skills")} placeholder="Python, Flask, SQL" />
          </label>
          <label className="block sm:col-span-2">
            <Label hint="one per line">Honest facts</Label>
            <Textarea rows={3} value={form.facts} onChange={set("facts")} placeholder={"Never worked on frontend\nHas never managed anyone"} />
          </label>
          {error && <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm font-bold text-red sm:col-span-2">{error}</p>}
          <div className="flex items-center justify-end gap-4 sm:col-span-2">
            <span className="text-sm font-bold text-muted">{saved === "saved" ? "Saved ✓" : saved === "dirty" ? "Unsaved changes" : ""}</span>
            <Btn type="submit">{saved === "new" ? "Save and build my cover →" : "Save"}</Btn>
          </div>
        </form>
      </Card>
    </>
  );
}

interface GameRow {
  id: string;
  scenario_name: string;
  alias: string;
  outcome: string;
  end_reason: string;
  score: number;
  final_suspicion: number;
  duration_sec: number;
  created_at: string;
}

function PastCalls() {
  const [games, setGames] = useState<GameRow[] | null>(null);
  useEffect(() => {
    void supabase()
      ?.from("games")
      .select("id, scenario_name, alias, outcome, end_reason, score, final_suspicion, duration_sec, created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setGames((data ?? []) as GameRow[]));
  }, []);
  if (!games?.length) return null;
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-black">Your past calls</h2>
      <ul className="mt-4 space-y-3">
        {games.map((g) => {
          const caught = g.outcome === "caught";
          return (
            <li key={g.id}>
              <Link
                href={`/debrief?id=${g.id}`}
                className="flex items-center gap-4 rounded-3xl border-2 border-lav-2 bg-white px-5 py-4 shadow-[0_4px_0_var(--lav-2)] transition hover:bg-panel-2"
              >
                <span className={`w-28 font-black ${caught ? "text-red" : "text-green"}`}>
                  {caught ? "BUSTED" : g.end_reason === "left" ? "HUNG UP" : "GOT AWAY"}
                </span>
                <span className="flex-1">
                  <span className="block font-black">
                    {g.alias} vs {g.scenario_name}
                  </span>
                  <span className="block text-xs font-bold text-muted">
                    {new Date(g.created_at).toLocaleString()} · {fmtTime(g.duration_sec)} · {g.final_suspicion}% sus
                  </span>
                </span>
                <span className="text-2xl font-black tabular-nums">{g.score.toLocaleString()}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
