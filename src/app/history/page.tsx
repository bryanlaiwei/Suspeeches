"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { Button, Card, Shell } from "@/components/ui";
import { supabase } from "@/lib/client/supabase";
import { fmtTime } from "@/lib/context";

interface GameRow {
  id: string;
  scenario_name: string;
  alias: string;
  outcome: string;
  end_reason: string;
  score: number;
  final_suspicion: number;
  larp_gap: number;
  duration_sec: number;
  created_at: string;
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <History />
    </RequireAuth>
  );
}

function History() {
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase()
      ?.from("games")
      .select("id, scenario_name, alias, outcome, end_reason, score, final_suspicion, larp_gap, duration_sec, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => (error ? setError(error.message) : setGames(data as GameRow[])));
  }, []);

  return (
    <Shell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black">Your history</h1>
          <p className="text-sm text-muted">Every scene you&apos;ve played, newest first.</p>
        </div>
        <Link href="/setup">
          <Button>New scene →</Button>
        </Link>
      </div>
      {error && <p className="text-sm text-sus">{error}</p>}
      {games === null && !error && <p className="text-sm text-muted">Loading…</p>}
      {games?.length === 0 && (
        <Card className="text-center text-sm text-muted">No games yet. Your debriefs will show up here.</Card>
      )}
      <ul className="space-y-3">
        {games?.map((g) => {
          const caught = g.outcome === "caught";
          return (
            <li key={g.id}>
              <Link href={`/debrief?id=${g.id}`}>
                <Card className="flex items-center gap-4 transition hover:bg-panel-2">
                  <span className="w-28 font-black" style={{ color: caught ? "var(--sus)" : "var(--clean)" }}>
                    {caught ? "CAUGHT" : g.end_reason === "left" ? "WALKED OUT" : "SURVIVED"}
                  </span>
                  <span className="flex-1 text-sm">
                    <span className="font-semibold">
                      {g.alias} vs {g.scenario_name}
                    </span>
                    <span className="block text-xs text-muted">
                      {new Date(g.created_at).toLocaleString()} · {fmtTime(g.duration_sec)} · gap {g.larp_gap} · final sus {g.final_suspicion}
                    </span>
                  </span>
                  <span className="font-mono text-2xl font-black">{g.score.toLocaleString()}</span>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
