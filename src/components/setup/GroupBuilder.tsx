"use client";

import { castFor, VOICES } from "@/lib/presets";
import { Avatar } from "../Avatar";
import { Button, cx, FIELD, Input, Label, ROW, Textarea } from "../ui";

export type GroupChar = { name: string; personality: string; expertise: string; voiceId: string };
export type GroupDraft = { setting: string; characters: GroupChar[] };

export const emptyGroup = (): GroupDraft => ({
  setting: "",
  characters: [
    { name: "", personality: "", expertise: "", voiceId: VOICES[0].id },
    { name: "", personality: "", expertise: "", voiceId: VOICES[1].id },
  ],
});

/** Builder for a custom group scene: 2-3 characters, each with their own voice. */
export function GroupBuilder({ group, onChange }: { group: GroupDraft; onChange: (g: GroupDraft) => void }) {
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
        <div key={i} className={cx(ROW, "flex gap-3 p-3")}>
          <Avatar palette={preview[i]} suspicion={15} className="h-14 w-14 shrink-0" />
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <Input value={c.name} onChange={(e) => setChar(i, { name: e.target.value })} placeholder={`Character ${i + 1} name`} />
            <select value={c.voiceId} onChange={(e) => setChar(i, { voiceId: e.target.value })} className={FIELD}>
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
              className="self-start text-muted hover:text-red"
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
