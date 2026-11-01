"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { StageShell } from "@/components/Shells";
import { Btn, Chip, cx, Face, Input, Label, Tag, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fetchProfile } from "@/lib/client/profileStore";
import { loadSetupDraft, saveSetupDraft, type SetupDraft } from "@/lib/client/storage";
import { goalText } from "@/lib/cover";
import { ALL_SCENES, ARTS, castName, PARTY_CAST, type Art, type ScenarioPreset, VOICES } from "@/lib/presets";
import { SetupSchema, type CallMood, type Profile, type ScenarioId } from "@/lib/schemas";
import { CALL_MOODS } from "@/lib/scoring";

type GroupChar = { name: string; personality: string; expertise: string; voiceId: string; art: Art };
type CustomChar = { name: string; personality: string; setting: string; voiceId: string; art: Art };

const MOOD_HINTS: Record<CallMood, string> = {
  chill: "Relaxed. Gives you the benefit of the doubt.",
  sharp: "Friendly, but notices details.",
  paranoid: "Already suspicious. Bigger score if you survive.",
};

/** 03 Pick a scenario: who to fool, and what mood they're in. */
export default function ScenarioPage() {
  return (
    <RequireAuth>
      <Picker />
    </RequireAuth>
  );
}

function Picker() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("recruiter");
  const [mood, setMood] = useState<CallMood>("sharp");
  const [minutes, setMinutes] = useState(5);
  const [custom, setCustom] = useState<CustomChar>({ name: "", personality: "", setting: "", voiceId: VOICES[0].id, art: "custom-male" });
  const [group, setGroup] = useState<{ setting: string; characters: GroupChar[] }>({
    setting: "",
    characters: [
      { name: "", personality: "", expertise: "", voiceId: VOICES[0].id, art: "custom-male" },
      { name: "", personality: "", expertise: "", voiceId: VOICES[1].id, art: "peer" },
    ],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProfile().then((p) => {
      if (!p) return router.replace("/account");
      const d = loadSetupDraft();
      if (!d?.cover || !d.claims?.length) return router.replace("/cover");
      setProfile(p);
      setDraft(d);
      if (d.scenarioId) setScenarioId(d.scenarioId);
      if (d.mood) setMood(d.mood);
      if (d.timeLimitSec) setMinutes(Math.round(d.timeLimitSec / 60));
      if (d.custom) setCustom({ ...d.custom, setting: d.custom.setting ?? "", art: (d.custom.art as Art) ?? "custom-male" });
      if (d.group)
        setGroup({ ...d.group, characters: d.group.characters.map((c) => ({ ...c, expertise: c.expertise ?? "", art: (c.art as Art) ?? "custom-male" })) });
    });
  }, [router]);

  const setupInput = useMemo(
    () => ({
      scenarioId,
      custom: scenarioId === "custom" ? custom : undefined,
      group: scenarioId === "group" ? group : undefined,
    }),
    [scenarioId, custom, group],
  );
  const who = scenarioId === "custom" ? custom.name || "them" : scenarioId === "group" ? "the crowd" : castName(setupInput);

  async function meet() {
    if (!profile || !draft) return;
    const parsed = SetupSchema.safeParse({
      ...setupInput,
      mood,
      alias: draft.alias,
      claims: draft.claims,
      goal: goalText(draft.cover?.goal, setupInput),
      timeLimitSec: minutes * 60,
      emailHandler: true,
    });
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0];
      const msg = parsed.error.issues[0]?.message ?? "";
      return setError(
        path === "custom"
          ? "Your character needs a name and a personality."
          : path === "group"
            ? msg.startsWith("Give each")
              ? msg
              : "Everyone in your crowd needs a name and a personality."
            : "Something's off with your cover. Go back and check it.",
      );
    }
    setBusy(true);
    setError(null);
    try {
      const gapFor = JSON.stringify([parsed.data.alias, parsed.data.claims]);
      const gap = draft.gap && draft.gapFor === gapFor ? draft.gap : (await api.gap(profile, parsed.data.alias, parsed.data.claims)).gap;
      saveSetupDraft({ ...draft, ...parsed.data, gap, gapFor, callReady: true });
      router.push("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!draft) return <StageShell>{null}</StageShell>;

  return (
    <StageShell
      right={
        <div className="flex gap-2" aria-label="Step 2 of 3">
          <span className="h-3 w-14 rounded-full bg-green" />
          <span className="h-3 w-14 rounded-full bg-green" />
          <span className="h-3 w-9 rounded-full bg-purple-deep" />
        </div>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-5 pb-16">
        <h1 className="text-center text-5xl font-black">Pick a scenario</h1>
        <p className="mt-2 text-center text-lg font-bold text-white/85">Who do you want to fool today?</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_SCENES.map((p) => (
            <SceneCard key={p.id} preset={p} selected={scenarioId === p.id} onClick={() => setScenarioId(p.id)} />
          ))}
        </div>

        {scenarioId === "custom" && <CustomBuilder value={custom} onChange={setCustom} />}
        {scenarioId === "group" && <GroupBuilder value={group} onChange={setGroup} />}

        <div className="mt-10 flex flex-col items-center gap-5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="mr-1 text-sm font-black uppercase tracking-widest text-white/80">Their mood</span>
            {(Object.keys(CALL_MOODS) as CallMood[]).map((m) => (
              <span key={m} title={MOOD_HINTS[m]}>
                <Chip selected={mood === m} onClick={() => setMood(m)}>
                  {CALL_MOODS[m].label}
                </Chip>
              </span>
            ))}
            <span className="mx-2 hidden h-8 w-0.5 rounded bg-white/30 sm:block" />
            {[3, 5].map((m) => (
              <Chip key={m} selected={minutes === m} onClick={() => setMinutes(m)}>
                {m} min
              </Chip>
            ))}
          </div>
          <p className="text-sm font-bold text-white/80">{MOOD_HINTS[mood]}</p>
          {error && <p className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-red">{error}</p>}
          <Btn size="lg" onClick={meet} disabled={busy} className="min-w-64">
            {busy ? "Measuring how big your lie is…" : `Meet ${who} →`}
          </Btn>
        </div>
      </div>
    </StageShell>
  );
}

function SceneCard({ preset: p, selected, onClick }: { preset: ScenarioPreset; selected: boolean; onClick: () => void }) {
  const faces = p.id === "party" ? PARTY_CAST.map((c) => c.art) : [p.art];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-[28px] border-4 bg-white p-4 text-left text-ink transition active:translate-y-1",
        selected ? "border-green shadow-[0_6px_0_var(--green-dark)]" : "border-white shadow-[0_6px_0_rgba(43,42,92,0.18)] hover:-translate-y-0.5",
      )}
    >
      <div className="flex h-44 items-end justify-center overflow-hidden rounded-3xl" style={{ background: p.tint }}>
        <div className={cx("flex", faces.length > 1 && "-space-x-6")}>
          {faces.map((art, i) => (
            <Face key={i} art={art} expression={selected ? "happy" : "chill"} size={faces.length > 1 ? 110 : 160} className="translate-y-3" />
          ))}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Tag>{p.tag}</Tag>
        {selected && <Tag color="bg-green-soft text-green">SELECTED</Tag>}
      </div>
      <h2 className="mt-2 text-3xl font-black">{p.id === "custom" || p.id === "group" || p.id === "party" ? p.label : p.character}</h2>
      <p className="mt-1 font-bold text-muted">{p.blurb}</p>
    </button>
  );
}

function ArtPicker({ value, onChange }: { value: Art; onChange: (a: Art) => void }) {
  return (
    <div className="flex gap-2">
      {ARTS.map((a) => (
        <button
          key={a.id}
          type="button"
          title={a.label}
          onClick={() => onChange(a.id)}
          className={cx("rounded-full p-0.5 transition", value === a.id ? "ring-4 ring-blue" : "opacity-70 hover:opacity-100")}
        >
          <Face art={a.id} expression="happy" size={44} />
        </button>
      ))}
    </div>
  );
}

function VoiceSelect({ value, onChange, taken }: { value: string; onChange: (v: string) => void; taken?: Set<string> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border-2 border-lav-2 bg-white px-4 py-3 font-bold text-ink outline-none focus:border-blue"
    >
      {VOICES.map((v) => (
        <option key={v.id} value={v.id} disabled={v.id !== value && taken?.has(v.id)}>
          {v.label}
        </option>
      ))}
    </select>
  );
}

function CustomBuilder({ value, onChange }: { value: CustomChar; onChange: (v: CustomChar) => void }) {
  const set = (patch: Partial<CustomChar>) => onChange({ ...value, ...patch });
  return (
    <div className="animate-sus-pop mt-8 rounded-[28px] bg-white p-6 text-ink shadow-[0_6px_0_rgba(43,42,92,0.18)]">
      <h3 className="text-2xl font-black">Who are you fooling?</h3>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <Label>Their name</Label>
          <Input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Linda, your future mother-in-law" />
        </label>
        <label className="block">
          <Label>Voice</Label>
          <VoiceSelect value={value.voiceId} onChange={(voiceId) => set({ voiceId })} />
        </label>
        <div className="sm:col-span-2">
          <Label>Look</Label>
          <ArtPicker value={value.art} onChange={(art) => set({ art })} />
        </div>
        <label className="block sm:col-span-2">
          <Label>Personality</Label>
          <Textarea
            rows={2}
            value={value.personality}
            onChange={(e) => set({ personality: e.target.value })}
            placeholder="Retired surgeon. Warm, nosy, and asks way too many follow-up questions."
          />
        </label>
        <label className="block sm:col-span-2">
          <Label hint="optional">Where you are</Label>
          <Input value={value.setting} onChange={(e) => set({ setting: e.target.value })} placeholder="First family dinner. The roast is getting cold." />
        </label>
      </div>
    </div>
  );
}

function GroupBuilder({
  value,
  onChange,
}: {
  value: { setting: string; characters: GroupChar[] };
  onChange: (v: { setting: string; characters: GroupChar[] }) => void;
}) {
  const setChar = (i: number, patch: Partial<GroupChar>) =>
    onChange({ ...value, characters: value.characters.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const taken = new Set(value.characters.map((c) => c.voiceId));
  return (
    <div className="animate-sus-pop mt-8 rounded-[28px] bg-white p-6 text-ink shadow-[0_6px_0_rgba(43,42,92,0.18)]">
      <h3 className="text-2xl font-black">Build your crowd</h3>
      <p className="font-bold text-muted">2-3 people. Each one only catches lies about what they know.</p>
      <label className="mt-4 block">
        <Label hint="optional">Where you are</Label>
        <Input value={value.setting} onChange={(e) => onChange({ ...value, setting: e.target.value })} placeholder="A backyard barbecue. Everyone works in tech except you, supposedly." />
      </label>
      <div className="mt-4 space-y-4">
        {value.characters.map((c, i) => (
          <div key={i} className="rounded-3xl border-2 border-lav-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ArtPicker value={c.art} onChange={(art) => setChar(i, { art })} />
              {value.characters.length > 2 && (
                <button
                  type="button"
                  className="text-sm font-black text-muted hover:text-red"
                  onClick={() => onChange({ ...value, characters: value.characters.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input value={c.name} onChange={(e) => setChar(i, { name: e.target.value })} placeholder={`Person ${i + 1}'s name`} />
              <VoiceSelect value={c.voiceId} onChange={(voiceId) => setChar(i, { voiceId })} taken={taken} />
              <Input value={c.personality} onChange={(e) => setChar(i, { personality: e.target.value })} placeholder="Personality: blunt, funny, a bit nosy" />
              <Input value={c.expertise} onChange={(e) => setChar(i, { expertise: e.target.value })} placeholder="Knows a lot about… (e.g. aviation)" />
            </div>
          </div>
        ))}
      </div>
      {value.characters.length < 3 && (
        <Btn
          tone="white"
          className="mt-4"
          onClick={() =>
            onChange({
              ...value,
              characters: [
                ...value.characters,
                { name: "", personality: "", expertise: "", voiceId: VOICES.find((v) => !taken.has(v.id))?.id ?? VOICES[0].id, art: "recruiter" },
              ],
            })
          }
        >
          + Add a third person
        </Btn>
      )}
    </div>
  );
}
