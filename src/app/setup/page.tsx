"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/Auth";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button, Card, cx, FictionNote, Input, Label, Shell, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fetchProfile } from "@/lib/client/profileStore";
import { loadSetupDraft, saveSetupDraft } from "@/lib/client/storage";
import { castFor, CUSTOM_PRESET, GROUP_PRESET, PARTY_CAST, PARTY_PRESET, PRESETS, presetFor, VOICES } from "@/lib/presets";
import { ScenarioIdSchema, SetupSchema, type GapResult, type Profile, type ScenarioId } from "@/lib/schemas";

const TIME_OPTIONS = [120, 180, 300, 480];

export default function SetupPage() {
  return (
    <RequireAuth>
      <SetupPageInner />
    </RequireAuth>
  );
}

function SetupPageInner() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("recruiter");
  const [custom, setCustom] = useState({ name: "", personality: "", setting: "", voiceId: VOICES[0].id });
  const [group, setGroup] = useState<{ setting: string; characters: GroupChar[] }>({
    setting: "",
    characters: [
      { name: "", personality: "", expertise: "", voiceId: VOICES[0].id },
      { name: "", personality: "", expertise: "", voiceId: VOICES[1].id },
    ],
  });
  const [alias, setAlias] = useState("");
  const [claims, setClaims] = useState<string[]>([]);
  const [draftClaim, setDraftClaim] = useState("");
  const [goal, setGoal] = useState(PRESETS[0].defaultGoal);
  const [timeLimitSec, setTimeLimitSec] = useState(180);
  const [emailHandler, setEmailHandler] = useState(false);
  const [suggestions, setSuggestions] = useState<{ claim: string; why: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [gap, setGap] = useState<GapResult | null>(null);
  const [gapFor, setGapFor] = useState("");
  const [gapLoading, setGapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void fetchProfile().then((p) => {
      if (!p) {
        router.replace("/account");
        return;
      }
      const d = loadSetupDraft();
      setProfile(p);
      setAlias(d?.alias || p.name);
      if (d?.scenarioId && ScenarioIdSchema.safeParse(d.scenarioId).success) setScenarioId(d.scenarioId);
      if (d?.custom) setCustom({ ...d.custom, setting: d.custom.setting ?? "" });
      if (d?.group) setGroup({ ...d.group, characters: d.group.characters.map((c) => ({ ...c, expertise: c.expertise ?? "" })) });
      if (d?.claims?.length) setClaims(d.claims);
      if (d?.goal) setGoal(d.goal);
      if (d?.timeLimitSec) setTimeLimitSec(d.timeLimitSec);
      if (d?.emailHandler && p.email) setEmailHandler(true);
      if (d?.gap && d.gapFor) {
        setGap(d.gap);
        setGapFor(d.gapFor);
      }
    });
  }, [router]);

  const preset = presetFor(scenarioId);
  const isGroup = scenarioId === "party" || scenarioId === "group";
  const audience =
    scenarioId === "custom"
      ? custom.name || "the character"
      : scenarioId === "group"
        ? group.characters.map((c) => c.name).filter(Boolean).join(", ") || "your group"
        : preset.character;
  const gapKey = useMemo(() => JSON.stringify([alias.trim(), claims]), [alias, claims]);
  const gapFresh = gap && gapFor === gapKey;

  function pickScenario(id: ScenarioId) {
    const next = presetFor(id);
    // Only replace the goal if the player hasn't customised it.
    if (ALL_SCENES.some((p) => p.defaultGoal === goal) || !goal.trim()) setGoal(next.defaultGoal);
    setScenarioId(id);
    setSuggestions([]);
  }

  function addClaim(text: string) {
    const t = text.trim();
    if (!t || claims.includes(t) || claims.length >= 8) return;
    setClaims((c) => [...c, t]);
    setSuggestions((s) => s.filter((x) => x.claim !== t));
  }

  async function suggest() {
    if (!profile) return;
    setSuggesting(true);
    setError(null);
    try {
      const { suggestions } = await api.suggest(profile, scenarioId, claims);
      setSuggestions(suggestions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  async function estimate(): Promise<GapResult | null> {
    if (!profile || !claims.length) return null;
    setGapLoading(true);
    setError(null);
    try {
      const { gap } = await api.gap(profile, alias, claims);
      setGap(gap);
      setGapFor(gapKey);
      return gap;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setGapLoading(false);
    }
  }

  async function start() {
    if (!profile) return;
    const parsed = SetupSchema.safeParse({
      scenarioId,
      custom: scenarioId === "custom" ? custom : undefined,
      group: scenarioId === "group" ? group : undefined,
      alias,
      claims,
      goal,
      timeLimitSec,
      emailHandler: emailHandler && !!profile.email,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue?.path[0] === "claims"
          ? "Add at least one claim to fake."
          : issue?.path[0] === "custom"
            ? "Give your custom character a name, personality and voice."
            : issue?.path[0] === "group"
              ? issue.message.startsWith("Give each")
                ? issue.message
                : "Give every group member a name, personality and voice."
              : `${issue?.path.join(".")}: ${issue?.message}`,
      );
      return;
    }
    setStarting(true);
    const g = gapFresh ? gap : await estimate();
    if (!g) {
      setStarting(false);
      return;
    }
    saveSetupDraft({ ...parsed.data, gap: g, gapFor: gapKey });
    router.push("/scene");
  }

  if (!profile) return null;

  return (
    <Shell step={1}>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/60 px-4 py-2.5 text-sm">
        <span className="text-muted">Playing as the real</span>
        <span className="font-semibold">{profile.name}</span>
        <span className="text-muted">
          · {[profile.role, profile.yearsExperience ? `${profile.yearsExperience} yrs` : ""].filter(Boolean).join(", ")}
        </span>
        <Link href="/account" className="ml-auto text-xs text-brand hover:underline">
          Edit profile
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 text-lg font-bold">1. Pick a scene</h2>
            <p className="mb-4 text-sm text-muted">Each character has their own voice, personality and way of probing.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ALL_SCENES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickScenario(p.id)}
                  className={cx(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                    scenarioId === p.id ? "border-brand bg-brand/10 ring-1 ring-brand/50" : "border-line hover:bg-panel-2",
                  )}
                >
                  {p.id === "party" ? (
                    <span className="flex shrink-0 -space-x-7">
                      {PARTY_CAST.map((c) => (
                        <Avatar key={c.name} palette={c} suspicion={15} getLevel={() => 0} className="h-14 w-14" />
                      ))}
                    </span>
                  ) : (
                    <Avatar palette={p} suspicion={15} getLevel={() => 0} className="h-16 w-16 shrink-0" />
                  )}
                  <span>
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block text-xs text-muted">
                      {p.id === "custom" || p.id === "group" || p.id === "party" ? p.blurb : `${p.character}, ${p.title}. ${p.blurb}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {scenarioId === "custom" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <Label>Character name</Label>
                  <Input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Morgan" />
                </label>
                <label className="block">
                  <Label>Voice</Label>
                  <select
                    value={custom.voiceId}
                    onChange={(e) => setCustom({ ...custom, voiceId: e.target.value })}
                    className="w-full rounded-xl border border-line bg-bg/60 px-3 py-2.5 text-sm outline-none focus:border-brand"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <Label>Personality</Label>
                  <Textarea
                    rows={2}
                    value={custom.personality}
                    onChange={(e) => setCustom({ ...custom, personality: e.target.value })}
                    placeholder="A retired airline captain. Warm, nosy, has flown every route and loves shop talk."
                  />
                </label>
                <label className="block sm:col-span-2">
                  <Label hint="optional">Setting</Label>
                  <Input
                    value={custom.setting}
                    onChange={(e) => setCustom({ ...custom, setting: e.target.value })}
                    placeholder="Seated next to you at a gate delayed by two hours."
                  />
                </label>
              </div>
            )}
            {scenarioId === "group" && <GroupBuilder group={group} onChange={setGroup} />}
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-bold">2. Your cover story</h2>
            <p className="mb-4 text-sm text-muted">
              This is all {audience} will know about you.{isGroup && " They'll all be listening."}
            </p>
            <label className="mb-4 block">
              <Label hint="the name you'll go by">Alias</Label>
              <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
            </label>
            <Label hint={`${claims.length}/8`}>Claims you&apos;ll fake</Label>
            <ul className="mb-3 space-y-2">
              {claims.map((c, i) => (
                <li key={c} className="flex items-start gap-2 rounded-xl border border-line bg-bg/50 px-3 py-2 text-sm">
                  <span className="mt-0.5 font-mono text-xs text-muted">{i + 1}</span>
                  <span className="flex-1">{c}</span>
                  <button
                    type="button"
                    className="text-muted hover:text-sus"
                    onClick={() => setClaims((cs) => cs.filter((x) => x !== c))}
                    aria-label={`Remove claim ${c}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addClaim(draftClaim);
                setDraftClaim("");
              }}
            >
              <Input
                value={draftClaim}
                onChange={(e) => setDraftClaim(e.target.value)}
                placeholder="I led our migration to Kubernetes"
              />
              <Button type="submit" variant="ghost" disabled={!draftClaim.trim() || claims.length >= 8}>
                Add
              </Button>
            </form>
            <div className="mt-4">
              <Button type="button" variant="subtle" className="px-0" onClick={suggest} disabled={suggesting}>
                {suggesting ? "Thinking up lies…" : "✨ Suggest claims from my profile"}
              </Button>
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.claim}
                      type="button"
                      onClick={() => addClaim(s.claim)}
                      title={s.why}
                      className="animate-sus-pop rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-left text-xs hover:bg-brand/20"
                    >
                      + {s.claim}
                      <span className="block text-[10px] text-muted">{s.why}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-bold">3. The scene</h2>
            <label className="mb-4 block">
              <Label>Your goal</Label>
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
            <Label>Time limit</Label>
            <div className="mb-4 flex gap-2">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimeLimitSec(t)}
                  className={cx(
                    "rounded-xl border px-4 py-2 font-mono text-sm",
                    timeLimitSec === t ? "border-brand bg-brand/15" : "border-line hover:bg-panel-2",
                  )}
                >
                  {t / 60} min
                </button>
              ))}
            </div>
            <label className={cx("flex items-center gap-3 text-sm", !profile.email && "opacity-50")}>
              <input
                type="checkbox"
                checked={emailHandler}
                disabled={!profile.email}
                onChange={(e) => setEmailHandler(e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              <span>
                Have the character email me a follow-up afterwards
                {!profile.email && (
                  <>
                    {" "}
                    (<Link href="/account" className="underline">add an email</Link> first)
                  </>
                )}
              </span>
            </label>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Larp gap</h2>
              <Button type="button" variant="ghost" onClick={estimate} disabled={!claims.length || gapLoading}>
                {gapLoading ? "Measuring…" : gapFresh ? "Re-estimate" : "Estimate"}
              </Button>
            </div>
            {gap ? (
              <div className={cx(!gapFresh && "opacity-50")}>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-5xl font-black">{gap.gapScore}</span>
                  <span className="text-muted">/ 100</span>
                  <span className="ml-auto rounded-full bg-brand/15 px-3 py-1 font-mono text-sm font-bold text-brand">
                    ×{gap.multiplier.toFixed(2)} score
                  </span>
                </div>
                <div className="my-3 h-2 overflow-hidden rounded-full bg-bg">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-clean via-warn to-sus"
                    style={{ width: `${gap.gapScore}%` }}
                  />
                </div>
                <p className="text-sm text-ink/80">{gap.rationale}</p>
                {gap.hardestClaims.length > 0 && (
                  <p className="mt-2 text-xs text-muted">Hardest to defend: {gap.hardestClaims.join(" · ")}</p>
                )}
                {!gapFresh && <p className="mt-2 text-xs text-warn">Claims changed. Re-estimate before you start.</p>}
              </div>
            ) : (
              <p className="text-sm text-muted">
                How far your cover is from the real you. Bigger gap, harder scene, bigger score multiplier.
              </p>
            )}
          </Card>
          <FictionNote />
          {error && <p className="rounded-xl border border-sus/40 bg-sus/10 px-4 py-3 text-sm text-sus">{error}</p>}
          <Button type="button" className="w-full py-4 text-base" onClick={start} disabled={starting || !claims.length}>
            {starting ? "Preparing the scene…" : `Enter the scene with ${audience} →`}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

const ALL_SCENES = [...PRESETS, PARTY_PRESET, CUSTOM_PRESET, GROUP_PRESET];

type GroupChar = { name: string; personality: string; expertise: string; voiceId: string };

/** Builder for a custom group scene: 2-3 characters, each with their own voice. */
function GroupBuilder({
  group,
  onChange,
}: {
  group: { setting: string; characters: GroupChar[] };
  onChange: (g: { setting: string; characters: GroupChar[] }) => void;
}) {
  const setChar = (i: number, patch: Partial<GroupChar>) =>
    onChange({ ...group, characters: group.characters.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const used = new Set(group.characters.map((c) => c.voiceId));
  const preview = castFor({ scenarioId: "group", group: { ...group, characters: group.characters.map((c, i) => ({ ...c, name: c.name || `#${i + 1}` })) } });
  return (
    <div className="mt-4 space-y-3">
      <label className="block">
        <Label hint="optional">Setting</Label>
        <Input
          value={group.setting}
          onChange={(e) => onChange({ ...group, setting: e.target.value })}
          placeholder="A backyard barbecue. Everyone works in tech except you, supposedly."
        />
      </label>
      {group.characters.map((c, i) => (
        <div key={i} className="flex gap-3 rounded-xl border border-line bg-bg/40 p-3">
          <Avatar palette={preview[i]} suspicion={15} getLevel={() => 0} className="h-14 w-14 shrink-0" />
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <Input value={c.name} onChange={(e) => setChar(i, { name: e.target.value })} placeholder={`Character ${i + 1} name`} />
            <select
              value={c.voiceId}
              onChange={(e) => setChar(i, { voiceId: e.target.value })}
              className="w-full rounded-xl border border-line bg-bg/60 px-3 py-2.5 text-sm outline-none focus:border-brand"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id} disabled={v.id !== c.voiceId && used.has(v.id)}>
                  {v.label}
                </option>
              ))}
            </select>
            <Textarea
              rows={2}
              className="sm:col-span-2"
              value={c.personality}
              onChange={(e) => setChar(i, { personality: e.target.value })}
              placeholder="A retired airline captain. Warm, nosy, loves shop talk."
            />
            <Input
              className="sm:col-span-2"
              value={c.expertise}
              onChange={(e) => setChar(i, { expertise: e.target.value })}
              placeholder="Knows a lot about… (e.g. aviation, airline operations)"
            />
          </div>
          {group.characters.length > 2 && (
            <button
              type="button"
              className="self-start text-muted hover:text-sus"
              onClick={() => onChange({ ...group, characters: group.characters.filter((_, j) => j !== i) })}
              aria-label={`Remove character ${i + 1}`}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {group.characters.length < 3 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            onChange({
              ...group,
              characters: [
                ...group.characters,
                { name: "", personality: "", expertise: "", voiceId: VOICES.find((v) => !used.has(v.id))?.id ?? VOICES[0].id },
              ],
            })
          }
        >
          + Add a third person
        </Button>
      )}
    </div>
  );
}
