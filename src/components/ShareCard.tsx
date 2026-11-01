"use client";

import { useEffect, useRef, useState } from "react";
import { START_SUSPICION } from "@/lib/scoring";
import type { PublicSessionState } from "@/lib/types";
import { Btn } from "./ui";

const W = 1200;
const H = 630;

/** Draws the shareable debrief card on a canvas (no external services, no html2canvas). */
function draw(canvas: HTMLCanvasElement, s: PublicSessionState) {
  const d = s.debrief!;
  const c = canvas.getContext("2d")!;
  canvas.width = W;
  canvas.height = H;
  const caught = d.outcome === "caught";
  const accent = caught ? "#ff4b4b" : "#d4f33a";

  // background
  c.fillStyle = "#7b6cf6";
  c.fillRect(0, 0, W, H);
  
  const font = (w: number, px: number) => `${w} ${px}px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif`;

  // brand
  c.font = font(900, 44);
  c.fillStyle = "#ffc800";
  c.fillText("Sus", 64, 92);
  c.fillStyle = "#ffffff";
  c.fillText("peeches", 64 + c.measureText("Sus").width, 92);
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.font = font(700, 22);
  c.fillText("Talk your way through.", 300, 90);

  // outcome
  c.fillStyle = accent;
  c.font = font(900, 120);
  c.fillText(caught ? "CAUGHT" : s.endReason === "left" ? "WALKED OUT" : "SURVIVED", 60, 240);

  c.fillStyle = "#ffffff";
  c.font = font(700, 34);
  wrap(c, `"${d.headline}"`, 64, 300, 700, 42, 2);

  c.fillStyle = "rgba(255,255,255,0.8)";
  c.font = font(500, 24);
  const who = `as ${s.setup.alias} vs ${s.scenarioName}`;
  c.fillText(who, 64, 400);

  // stats
  const stats = [
    ["SCORE", d.score.toLocaleString()],
    ["FINAL SUS", `${d.finalSuspicion}`],
    ["LARP GAP", `${d.larpGap}`],
    ["CLAIMS HELD", `${d.claims.filter((x) => x.verdict === "held").length}/${d.claims.length}`],
  ];
  stats.forEach(([k, v], i) => {
    const x = 64 + i * 200;
    c.fillStyle = "rgba(255,255,255,0.8)";
    c.font = font(700, 18);
    c.fillText(k, x, 480);
    c.fillStyle = i === 0 ? accent : "#ffffff";
    c.font = font(900, 52);
    c.fillText(v, x, 540);
  });

  // sparkline
  const sx = 860;
  const sy = 330;
  const sw = 280;
  const sh = 200;
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = 2;
  c.strokeRect(sx, sy, sw, sh);
  c.strokeStyle = "#ff4b4b";
  c.setLineDash([6, 6]);
  c.beginPath();
  c.moveTo(sx, sy + 2);
  c.lineTo(sx + sw, sy + 2);
  c.stroke();
  c.setLineDash([]);
  const dur = Math.max(d.durationSec, s.events.at(-1)?.tSec ?? 0, 10);
  const px = (t: number) => sx + (t / dur) * sw;
  const py = (v: number) => sy + sh - (v / 100) * sh;
  c.strokeStyle = accent;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(px(0), py(START_SUSPICION));
  let prev = START_SUSPICION;
  for (const e of s.events) {
    c.lineTo(px(e.tSec), py(prev));
    c.lineTo(px(e.tSec), py(e.suspicion));
    prev = e.suspicion;
  }
  c.lineTo(px(dur), py(prev));
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.8)";
  c.font = font(600, 16);
  c.fillText("SUSPICION OVER TIME", sx, sy - 12);

  c.fillStyle = "rgba(255,255,255,0.7)";
  c.font = font(500, 16);
  c.fillText("Practice & entertainment only. All characters are fictional.", 64, 600);
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, y + lines * lh);
      lines++;
      line = w;
      if (lines >= maxLines) return;
    } else line = test;
  }
  if (line) c.fillText(line, x, y + lines * lh);
}

export function ShareCard({ state }: { state: PublicSessionState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const d = state.debrief!;

  useEffect(() => {
    if (ref.current) draw(ref.current, state);
  }, [state]);

  const text = `I ${d.outcome === "caught" ? "got CAUGHT" : "SURVIVED"} on Suspeeches as "${state.setup.alias}" vs ${state.scenarioName}: ${d.score.toLocaleString()} pts, final suspicion ${d.finalSuspicion}/100, larp gap ${d.larpGap}. "${d.headline}"`;

  async function download() {
    const url = ref.current!.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `suspeeches-${state.id.slice(0, 8)}.png`;
    a.click();
  }

  async function share() {
    const blob = await new Promise<Blob | null>((r) => ref.current!.toBlob(r, "image/png"));
    const file = blob ? new File([blob], "suspeeches.png", { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Suspeeches results", text, files: [file] });
        return;
      }
    } catch {
      /* cancelled or unsupported: fall through to copy */
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <canvas ref={ref} className="w-full rounded-2xl" aria-label="Shareable debrief card" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn onClick={download}>Download card</Btn>
        <Btn tone="white" onClick={share}>
          {copied ? "Copied!" : "Share"}
        </Btn>
      </div>
    </div>
  );
}
