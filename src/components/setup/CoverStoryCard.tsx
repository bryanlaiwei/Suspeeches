"use client";

import { useState } from "react";
import { Btn, Button, Card, cx, Input, Label, PICK_BASE, PICK_OFF, ROW } from "../ui";

export const MAX_CLAIMS = 8;

/** Step 2: the alias and the claims to fake, with suggestions and the save button that measures the gap. */
export function CoverStoryCard({
  audience,
  isGroup,
  alias,
  onAlias,
  claims,
  onAddClaim,
  onRemoveClaim,
  suggestions,
  suggesting,
  onSuggest,
  saved,
  saving,
  onSave,
}: {
  /** Who will hear the cover story, e.g. "Dana" or "your group". */
  audience: string;
  isGroup: boolean;
  alias: string;
  onAlias: (alias: string) => void;
  claims: string[];
  onAddClaim: (claim: string) => void;
  onRemoveClaim: (claim: string) => void;
  suggestions: { claim: string; why: string }[];
  suggesting: boolean;
  onSuggest: () => void;
  /** Saved and the gap is measured for exactly this cover; `stale` means saved but the gap needs a refresh. */
  saved: "fresh" | "stale" | "unsaved";
  saving: boolean;
  onSave: () => void;
}) {
  const [draftClaim, setDraftClaim] = useState("");
  const done = saved === "fresh";
  return (
    <Card>
      <h2 className="mb-1 text-lg font-black">2. Your cover story</h2>
      <p className="mb-4 text-sm font-bold text-muted">
        This is all {audience} will know about you.{isGroup && " They'll all be listening."}
      </p>
      <label className="mb-4 block">
        <Label hint="the name you'll go by">Alias</Label>
        <Input value={alias} onChange={(e) => onAlias(e.target.value)} />
      </label>
      <Label hint={`${claims.length}/${MAX_CLAIMS}`}>Claims you&apos;ll fake</Label>
      <ul className="mb-3 space-y-2">
        {claims.map((c, i) => (
          <li key={c} className={cx(ROW, "flex items-start gap-2")}>
            <span className="mt-0.5 text-xs font-black text-muted">{i + 1}</span>
            <span className="flex-1">{c}</span>
            <button type="button" className="text-muted hover:text-red" onClick={() => onRemoveClaim(c)} aria-label={`Remove claim ${c}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAddClaim(draftClaim);
          setDraftClaim("");
        }}
      >
        <Input value={draftClaim} onChange={(e) => setDraftClaim(e.target.value)} placeholder="I led our migration to Kubernetes" />
        <Button type="submit" variant="ghost" disabled={!draftClaim.trim() || claims.length >= MAX_CLAIMS}>
          Add
        </Button>
      </form>
      <div className="mt-4">
        <Button type="button" variant="subtle" className="px-0" onClick={onSuggest} disabled={suggesting}>
          {suggesting ? "Thinking up lies…" : "✨ Suggest claims from my profile"}
        </Button>
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.claim}
                type="button"
                onClick={() => onAddClaim(s.claim)}
                title={s.why}
                className={cx("animate-sus-pop px-3 py-2 text-xs", PICK_BASE, PICK_OFF)}
              >
                + {s.claim}
                <span className="block text-xs font-semibold text-muted">{s.why}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t-2 border-lav-2 pt-4">
        {done ? (
          <span className="flex items-center gap-2 text-sm font-extrabold text-green">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green text-xs text-white">✓</span>
            Cover story saved
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-bold text-muted">
            <span className={cx("h-2.5 w-2.5 rounded-full", claims.length ? "animate-pulse bg-yellow" : "bg-lav-2")} />
            {!claims.length ? "Add a claim to save your cover" : saved === "stale" ? "Save to update the larp gap" : "Unsaved changes"}
          </span>
        )}
        <Btn type="button" size="sm" tone={done ? "white" : "green"} onClick={onSave} disabled={done || !claims.length || saving}>
          {saving ? "Saving…" : done ? "Saved" : "💾 Save cover story"}
        </Btn>
      </div>
    </Card>
  );
}
