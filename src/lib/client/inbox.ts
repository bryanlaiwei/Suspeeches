"use client";

import { useEffect, useState } from "react";
import { castFor, presetFor, type Art } from "../presets";
import type { Setup } from "../schemas";
import type { Followup } from "../types";
import { loadReadIds, loadSetupDraft } from "./storage";
import { supabase } from "./supabase";

export interface InboxItem {
  id: string;
  kind: "invite" | "followup";
  from: string;
  role: string;
  art: Art;
  tint: string;
  preview: string;
  subject?: string;
  body?: string;
  at: number;
  unread: boolean;
  /** Where clicking goes (invite) or the game it belongs to (follow-up). */
  href: string;
  goalReached?: boolean;
}

/** Call invite (from the current setup) + every follow-up characters sent after past games. */
export function useInbox() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const read = loadReadIds();
      const out: InboxItem[] = [];
      const draft = loadSetupDraft();
      if (draft?.callReady && draft.scenarioId) {
        const cast = castFor(draft as Setup);
        const p = presetFor(draft.scenarioId);
        const id = `invite-${draft.gapFor ?? "current"}`;
        out.push({
          id,
          kind: "invite",
          from: cast.length > 1 ? cast.map((c) => c.name).join(", ") : cast[0].name,
          role: cast.length > 1 ? p.title : cast[0].title,
          art: cast[0].art,
          tint: cast[0].tint,
          preview: `Hi ${draft.alias ?? "there"}! I have a quick call invite for you.`,
          at: Date.now(),
          unread: !read.has(id),
          href: "/scene",
        });
      }
      const sb = supabase();
      if (sb) {
        const { data } = await sb
          .from("games")
          .select("id, created_at, setup:state->setup, followup:state->followup")
          .order("created_at", { ascending: false })
          .limit(30);
        for (const g of (data ?? []) as { id: string; created_at: string; setup: Setup; followup: Followup | null }[]) {
          if (!g.followup) continue;
          const who = castFor(g.setup).find((c) => c.name === g.followup!.sender) ?? castFor(g.setup)[0];
          const id = `followup-${g.id}`;
          out.push({
            id,
            kind: "followup",
            from: g.followup.sender,
            role: who.title,
            art: who.art,
            tint: who.tint,
            preview: g.followup.body.replace(/\s+/g, " ").slice(0, 80),
            subject: g.followup.subject,
            body: g.followup.body,
            at: new Date(g.created_at).getTime(),
            unread: !read.has(id),
            href: `/debrief?id=${g.id}`,
            goalReached: g.followup.goalReached,
          });
        }
      }
      if (!cancelled) setItems(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}

export function timeAgo(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
