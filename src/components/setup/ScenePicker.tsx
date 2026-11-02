"use client";

import { ALL_SCENES, isGroupScenario, VOICES } from "@/lib/presets";
import type { ScenarioId } from "@/lib/schemas";
import { Avatar } from "../Avatar";
import { Card, cx, FIELD, Input, Label, PICK_BASE, PICK_OFF, PICK_ON, Textarea } from "../ui";
import { GroupBuilder, type GroupDraft } from "./GroupBuilder";

export { ALL_SCENES };

export type CustomDraft = { name: string; personality: string; setting: string; voiceId: string };

/** Step 1: pick a preset scene, or write your own character or group. */
export function ScenePicker({
  scenarioId,
  onPick,
  custom,
  onCustom,
  group,
  onGroup,
}: {
  scenarioId: ScenarioId;
  onPick: (id: ScenarioId) => void;
  custom: CustomDraft;
  onCustom: (c: CustomDraft) => void;
  group: GroupDraft;
  onGroup: (g: GroupDraft) => void;
}) {
  return (
    <Card>
      <h2 className="mb-1 text-lg font-black">1. Pick a scene</h2>
      <p className="mb-4 text-sm font-bold text-muted">Each character has their own voice, personality and way of probing.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ALL_SCENES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            className={cx(PICK_BASE, "flex items-center gap-3 p-3", scenarioId === p.id ? PICK_ON : PICK_OFF)}
          >
            {p.cast ? (
              <span className="flex shrink-0 -space-x-7">
                {p.cast.map((c) => (
                  <Avatar key={c.name} palette={c} suspicion={15} className="h-14 w-14" />
                ))}
              </span>
            ) : (
              <Avatar palette={p} suspicion={15} className="h-16 w-16 shrink-0" />
            )}
            <span>
              <span className="block font-black">{p.label}</span>
              <span className="block text-xs font-bold text-muted">
                {p.kind === "custom" || isGroupScenario(p.id) ? p.blurb : `${p.character}, ${p.title}. ${p.blurb}`}
              </span>
            </span>
          </button>
        ))}
      </div>
      {scenarioId === "custom" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>Character name</Label>
            <Input value={custom.name} onChange={(e) => onCustom({ ...custom, name: e.target.value })} placeholder="Morgan" />
          </label>
          <label className="block">
            <Label>Voice</Label>
            <select value={custom.voiceId} onChange={(e) => onCustom({ ...custom, voiceId: e.target.value })} className={FIELD}>
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
              onChange={(e) => onCustom({ ...custom, personality: e.target.value })}
              placeholder="A retired airline captain. Warm, nosy, has flown every route and loves shop talk."
            />
          </label>
          <label className="block sm:col-span-2">
            <Label hint="optional">Setting</Label>
            <Input
              value={custom.setting}
              onChange={(e) => onCustom({ ...custom, setting: e.target.value })}
              placeholder="Seated next to you at a gate delayed by two hours."
            />
          </label>
        </div>
      )}
      {scenarioId === "group" && <GroupBuilder group={group} onChange={onGroup} />}
    </Card>
  );
}
