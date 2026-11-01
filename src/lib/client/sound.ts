"use client";

/** Tiny synthesized sound cues (no audio files). Call unlockAudio() from a user gesture first. */

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain = 0.12, slideTo?: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(lp).connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Suspicion spike: a short "dun-DUN". */
export function playSpike(intensity = 1) {
  unlockAudio();
  const g = 0.08 + 0.08 * Math.min(1, intensity);
  tone(220, 0, 0.16, "square", g);
  tone(155, 0.18, 0.32, "square", g, 120);
}

/** Small relief cue when suspicion drops a lot. */
export function playRelief() {
  unlockAudio();
  tone(523, 0, 0.12, "sine", 0.06);
  tone(659, 0.1, 0.18, "sine", 0.06);
}

export function playCaught() {
  unlockAudio();
  for (let i = 0; i < 3; i++) tone(880, i * 0.32, 0.26, "sawtooth", 0.09, 440);
}

export function playSurvived() {
  unlockAudio();
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, "triangle", 0.08));
}
