"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button, Card, FictionNote, Input, Label, Shell, Textarea } from "@/components/ui";
import { loadProfile, saveProfile } from "@/lib/client/storage";
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
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [demoSus, setDemoSus] = useState(20);

  useEffect(() => {
    const p = loadProfile();
    if (p) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage once on mount
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
    }
    const id = setInterval(() => setDemoSus((s) => (s >= 90 ? 10 : s + 8)), 900);
    return () => clearInterval(id);
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
  };

  function submit(e: React.FormEvent) {
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
    saveProfile(parsed.data);
    router.push("/setup");
  }

  return (
    <Shell step={1}>
      <div className="grid flex-1 items-start gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="pt-4 lg:pt-10">
          <p className="mb-3 inline-block rounded-full border border-sus/40 bg-sus/10 px-3 py-1 text-xs font-semibold tracking-wide text-sus">
            A voice game for LarpHacks
          </p>
          <h1 className="text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl">
            Don&apos;t give
            <br />
            yourself <span className="text-sus">away.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Pick a cover story. Talk your way through a conversation with an AI character who only knows your
            claims. A hidden judge knows the truth, and the bar above their head is watching.
          </p>
          <div className="mt-8 flex items-end gap-6">
            <div className="relative w-44">
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${demoSus}%`,
                    background: demoSus > 70 ? "var(--sus)" : demoSus > 40 ? "var(--warn)" : "var(--clean)",
                  }}
                />
              </div>
              <Avatar palette={PRESETS[0]} suspicion={demoSus} getLevel={() => 0} className="w-44" />
            </div>
            <ol className="space-y-2 pb-4 text-sm text-ink/80">
              <li>1. Tell us who you really are</li>
              <li>2. Pick what you&apos;ll fake</li>
              <li>3. Talk. Out loud.</li>
              <li>4. Get the debrief</li>
            </ol>
          </div>
        </div>

        <Card className="lg:mt-6">
          <h2 className="text-lg font-bold">Your real profile</h2>
          <p className="mb-5 text-sm text-muted">
            Only the hidden judge sees this. The character never does. Stored in this browser only.
          </p>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Name</Label>
              <Input value={form.name} onChange={set("name")} placeholder="Sam Rivera" required />
            </label>
            <label className="block">
              <Label hint="optional, for handler emails">Email</Label>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" />
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
            {error && <p className="text-sm text-sus sm:col-span-2">{error}</p>}
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-xs text-muted">{saved ? "Saved in this browser" : ""}</span>
              <Button type="submit">Next: pick your cover →</Button>
            </div>
          </form>
          <FictionNote className="mt-5" />
        </Card>
      </div>
    </Shell>
  );
}
