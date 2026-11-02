"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/Auth";
import { useEffect, useMemo, useState } from "react";
import { CoverStoryCard, MAX_CLAIMS } from "@/components/setup/CoverStoryCard";
import { GapCard } from "@/components/setup/GapCard";
import { emptyGroup, type GroupDraft } from "@/components/setup/GroupBuilder";
import { ALL_SCENES, ScenePicker, type CustomDraft } from "@/components/setup/ScenePicker";
import { Button, Card, Chip, ERROR_NOTE, FictionNote, Input, Label, Shell } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fetchProfile } from "@/lib/client/profileStore";
import { gapKeyFor, loadSetupDraft, saveSetupDraft, type SetupDraft } from "@/lib/client/storage";
import { isGroupScenario, PRESETS, presetFor, VOICES } from "@/lib/presets";
import { ScenarioIdSchema, SetupSchema, type GapResult, type Profile, type ScenarioId } from "@/lib/schemas";

const TIME_OPTIONS = [150, 300, 600];

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
  const [custom, setCustom] = useState<CustomDraft>({ name: "", personality: "", setting: "", voiceId: VOICES[0].id });
  const [group, setGroup] = useState<GroupDraft>(emptyGroup);
  const [alias, setAlias] = useState("");
  const [claims, setClaims] = useState<string[]>([]);
  const [goal, setGoal] = useState(PRESETS[0].defaultGoal);
  const [timeLimitSec, setTimeLimitSec] = useState(300);
  const [suggestions, setSuggestions] = useState<{ claim: string; why: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [gap, setGap] = useState<GapResult | null>(null);
  /** The server's signature over `gap`, handed back when the scene starts. */
  const [gapToken, setGapToken] = useState("");
  const [gapFor, setGapFor] = useState("");
  const [gapLoading, setGapLoading] = useState(false);
  /** Cover story (alias + claims) as last saved, to show unsaved changes. */
  const [savedCover, setSavedCover] = useState("");
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
      if (d?.timeLimitSec && TIME_OPTIONS.includes(d.timeLimitSec)) setTimeLimitSec(d.timeLimitSec);
      if (d?.gap && d.gapFor) {
        setGap(d.gap);
        setGapToken(d.gapToken ?? "");
        setGapFor(d.gapFor);
      }
      if (d?.claims?.length) setSavedCover(coverKeyFor(d.alias || p.name, d.claims));
    });
  }, [router]);

  const preset = presetFor(scenarioId);
  const isGroup = isGroupScenario(scenarioId);
  const audience =
    scenarioId === "custom"
      ? custom.name || "the character"
      : scenarioId === "group"
        ? group.characters.map((c) => c.name).filter(Boolean).join(", ") || "your group"
        : preset.character;
  const gapKey = useMemo(() => (profile ? gapKeyFor(profile, alias, claims) : ""), [profile, alias, claims]);
  const gapFresh = !!gap && gapFor === gapKey;
  const coverKey = coverKeyFor(alias, claims);
  const coverSaved = !!claims.length && savedCover === coverKey;

  function pickScenario(id: ScenarioId) {
    const next = presetFor(id);
    // Only replace the goal if the player hasn't customised it.
    if (ALL_SCENES.some((p) => p.defaultGoal === goal) || !goal.trim()) setGoal(next.defaultGoal);
    setScenarioId(id);
    setSuggestions([]);
  }

  function addClaim(text: string) {
    const t = text.trim();
    if (!t || claims.includes(t) || claims.length >= MAX_CLAIMS) return;
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

  async function estimate(p: Profile, a: string, c: string[]): Promise<{ gap: GapResult; token: string } | null> {
    if (!c.length) return null;
    setGapLoading(true);
    setError(null);
    try {
      const res = await api.gap(p, a, c);
      setGap(res.gap);
      setGapToken(res.token);
      setGapFor(gapKeyFor(p, a, c));
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setGapLoading(false);
    }
  }

  function draft(): SetupDraft {
    return {
      scenarioId,
      custom: scenarioId === "custom" ? custom : undefined,
      group: scenarioId === "group" ? group : undefined,
      alias,
      claims,
      goal,
      timeLimitSec,
    };
  }

  /** Saves the setup for next time and re-estimates the gap (the only place it's estimated here). */
  async function saveCover() {
    if (!profile || !claims.length) return;
    saveSetupDraft({ ...draft(), gap, gapToken, gapFor });
    setSavedCover(coverKey);
    const g = await estimate(profile, alias, claims);
    if (g) saveSetupDraft({ ...draft(), gap: g.gap, gapToken: g.token, gapFor: gapKey });
  }

  async function start() {
    if (!profile) return;
    const parsed = SetupSchema.safeParse(draft());
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
    if (!gapFresh || !gap) {
      setError("Save your cover story first so we can measure the larp gap.");
      return;
    }
    setStarting(true);
    saveSetupDraft({ ...parsed.data, gap, gapToken, gapFor: gapKey });
    router.push("/scene");
  }

  if (!profile) return null;

  return (
    <Shell step={1}>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-lav-2 bg-white px-4 py-2.5 text-sm font-bold shadow-[0_3px_0_var(--lav-2)]">
        <span className="text-muted">Playing as the real</span>
        <span className="font-black">{profile.name}</span>
        <span className="text-muted">
          · {[profile.role, profile.yearsExperience ? `${profile.yearsExperience} yrs` : ""].filter(Boolean).join(", ")}
        </span>
        <Link href="/account" className="ml-auto text-xs font-extrabold uppercase tracking-widest text-blue hover:underline">
          Edit profile
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <ScenePicker scenarioId={scenarioId} onPick={pickScenario} custom={custom} onCustom={setCustom} group={group} onGroup={setGroup} />

          <CoverStoryCard
            audience={audience}
            isGroup={isGroup}
            alias={alias}
            onAlias={setAlias}
            claims={claims}
            onAddClaim={addClaim}
            onRemoveClaim={(c) => setClaims((cs) => cs.filter((x) => x !== c))}
            suggestions={suggestions}
            suggesting={suggesting}
            onSuggest={suggest}
            saved={coverSaved ? (gapFresh ? "fresh" : "stale") : "unsaved"}
            saving={gapLoading}
            onSave={saveCover}
          />

          <Card>
            <h2 className="mb-4 text-lg font-black">3. The scene</h2>
            <label className="mb-4 block">
              <Label>Your goal</Label>
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
            <Label>Time limit</Label>
            <div className="flex gap-2">
              {TIME_OPTIONS.map((t) => (
                <Chip key={t} selected={timeLimitSec === t} onClick={() => setTimeLimitSec(t)}>
                  {t / 60} min
                </Chip>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <GapCard gap={gap} fresh={gapFresh} loading={gapLoading} />
          <FictionNote />
          {error && <p className={ERROR_NOTE}>{error}</p>}
          <Button type="button" className="w-full py-4 text-base" onClick={start} disabled={starting || !claims.length || !gapFresh || gapLoading}>
            {starting ? "Preparing the scene…" : gapFresh ? `Enter the scene with ${audience} →` : "Save your cover story first"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

const coverKeyFor = (alias: string, claims: string[]) => JSON.stringify([alias.trim(), claims]);
