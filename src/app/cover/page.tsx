"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { StepShell } from "@/components/Shells";
import { Btn, Chip, Face, Input, Label } from "@/components/ui";
import { fetchProfile } from "@/lib/client/profileStore";
import { loadSetupDraft, saveSetupDraft, type Cover } from "@/lib/client/storage";
import { claimsFromCover } from "@/lib/cover";
import { PLAYER_ART } from "@/lib/presets";

const YEARS = ["0–1", "2–4", "5–9", "10+"] as const;
const GOALS: { id: Cover["goal"]; label: string }[] = [
  { id: "interview", label: "Get the interview" },
  { id: "referral", label: "Get a referral" },
  { id: "vibe", label: "Just vibe" },
];

/** Ready-made fake personas for the Randomize button. */
const RANDOM_COVERS: Omit<Cover, "goal" | "alias">[] = [
  { title: "Senior Frontend Engineer", years: "5–9", projects: ["Led our Angular to React migration", "Managed a team of 4 engineers"], skills: ["React", "TypeScript"] },
  { title: "Product Designer", years: "5–9", projects: ["Shopify checkout redesign"], skills: ["Figma", "Research"] },
  { title: "Machine Learning Engineer", years: "2–4", projects: ["Built a fraud-detection model in production"], skills: ["PyTorch", "Python"] },
  { title: "Engineering Manager", years: "10+", projects: ["Scaled a team from 3 to 20"], skills: ["Hiring", "Roadmaps"] },
  { title: "Growth Marketer", years: "5–9", projects: ["Doubled signups with a referral program"], skills: ["SEO", "Paid ads"] },
  { title: "Data Scientist", years: "2–4", projects: ["Built the company's pricing model"], skills: ["SQL", "Statistics"] },
];
const RANDOM_NAMES = ["Alex Rivera", "Jordan Blake", "Sam Taylor", "Casey Morgan", "Riley Chen", "Avery Brooks"];

/** 02 Build your cover story (the fake you). */
export default function CoverPage() {
  return (
    <RequireAuth>
      <CoverForm />
    </RequireAuth>
  );
}

function CoverForm() {
  const router = useRouter();
  const [cover, setCover] = useState<Cover>({ alias: "", title: "", years: "5–9", projects: [], skills: [], goal: "interview" });
  const [project, setProject] = useState("");
  const [skill, setSkill] = useState("");
  const [addingSkill, setAddingSkill] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProfile().then((p) => {
      if (!p) return router.replace("/account");
      const saved = loadSetupDraft()?.cover;
      setCover(saved ?? { alias: p.name, title: "", years: "5–9", projects: [], skills: [], goal: "interview" });
    });
  }, [router]);

  const set = (patch: Partial<Cover>) => setCover((c) => ({ ...c, ...patch }));

  function randomize() {
    const r = RANDOM_COVERS[Math.floor(Math.random() * RANDOM_COVERS.length)];
    set({ ...r, alias: cover.alias || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] });
  }

  function addProject() {
    const p = project.trim();
    if (p && !cover.projects.includes(p) && cover.projects.length < 4) set({ projects: [...cover.projects, p] });
    setProject("");
  }

  function addSkill() {
    const s = skill.trim();
    if (s && !cover.skills.includes(s) && cover.skills.length < 6) set({ skills: [...cover.skills, s] });
    setSkill("");
    setAddingSkill(false);
  }

  function next() {
    const projects = project.trim() ? [...cover.projects, project.trim()] : cover.projects;
    const final = { ...cover, projects };
    if (!final.alias.trim() || !final.title.trim()) return setError("Every good lie needs a name and a job title.");
    const draft = loadSetupDraft() ?? {};
    saveSetupDraft({ ...draft, cover: final, alias: final.alias.trim(), claims: claimsFromCover(final), callReady: false });
    router.push("/scenario");
  }

  return (
    <StepShell
      progress={45}
      onClose={() => router.push("/home")}
      footer={
        <>
          <Btn tone="white" onClick={randomize}>
            Randomize
          </Btn>
          {error && <span className="text-sm font-bold text-red">{error}</span>}
          <Btn onClick={next}>Continue</Btn>
        </>
      }
    >
      <div className="w-full max-w-3xl pt-10">
        <div className="flex items-center gap-5">
          <Face art={PLAYER_ART} expression="happy" size={120} />
          <div className="rounded-3xl border-2 border-lav-2 bg-white px-6 py-4 text-2xl font-black shadow-[0_4px_0_var(--lav-2)] sm:text-3xl">
            First, build your cover story.
          </div>
        </div>
        <p className="mt-4 font-bold text-muted">
          This is the fake you. The characters will believe it… until you give them a reason not to.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <label className="block">
            <Label>Name</Label>
            <Input value={cover.alias} onChange={(e) => set({ alias: e.target.value })} placeholder="Alex Rivera" />
          </label>
          <label className="block">
            <Label>Job title</Label>
            <Input value={cover.title} onChange={(e) => set({ title: e.target.value })} placeholder="Product Designer" />
          </label>
        </div>

        <div className="mt-6">
          <Label>Years of experience</Label>
          <div className="flex flex-wrap gap-3">
            {YEARS.map((y) => (
              <Chip key={y} selected={cover.years === y} onClick={() => set({ years: y })}>
                {y}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <Label hint="your proudest made-up wins">Projects</Label>
            {cover.projects.map((p) => (
              <div key={p} className="mb-2 flex items-center justify-between gap-2 rounded-2xl border-2 border-lav-2 bg-white px-4 py-3 font-bold">
                <span>{p}</span>
                <button type="button" aria-label={`Remove ${p}`} className="text-muted hover:text-red" onClick={() => set({ projects: cover.projects.filter((x) => x !== p) })}>
                  ✕
                </button>
              </div>
            ))}
            {cover.projects.length < 4 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addProject();
                }}
              >
                <Input value={project} onChange={(e) => setProject(e.target.value)} onBlur={addProject} placeholder="Shopify checkout redesign" />
              </form>
            )}
          </div>
          <div>
            <Label>Skills</Label>
            <div className="flex flex-wrap gap-3">
              {cover.skills.map((s) => (
                <Chip key={s} selected onClick={() => set({ skills: cover.skills.filter((x) => x !== s) })}>
                  {s}
                </Chip>
              ))}
              {addingSkill ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addSkill();
                  }}
                >
                  <Input autoFocus value={skill} onChange={(e) => setSkill(e.target.value)} onBlur={addSkill} placeholder="Figma" className="w-36 py-2" />
                </form>
              ) : (
                cover.skills.length < 6 && <Chip onClick={() => setAddingSkill(true)}>+ Add</Chip>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Label>Your goal</Label>
          <div className="flex flex-wrap gap-3">
            {GOALS.map((g) => (
              <Chip key={g.id} selected={cover.goal === g.id} onClick={() => set({ goal: g.id })}>
                {g.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </StepShell>
  );
}
