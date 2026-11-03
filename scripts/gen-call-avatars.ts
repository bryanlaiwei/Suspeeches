/**
 * Makes the video-call version of every face: public/avatars/<id>/<mood>-call.png.
 *
 * The art is drawn as a round avatar (a flat background circle, shoulders cut off by its edge).
 * On a call tile a person should sit in the frame like on a real video call, so this removes the
 * background circle, continues the shoulders down to the bottom corners, and carries the body on
 * below the frame so it stays on the tile's bottom edge however the head moves. The round originals
 * stay as they are for setup, briefing and the debrief.
 *
 *   npx tsx scripts/gen-call-avatars.ts   # after adding or changing any art in public/avatars
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..", "public", "avatars");
const MOODS = ["happy", "chill", "suspicious"] as const;
/** Output size (px). The art is 660 units; twice that stays sharp on a large tile at 2× pixel density. */
const N = 1320;
const C = N / 2;
/** How far (px) a colour may be from the background colour and still count as background. */
const BG_TOLERANCE = 28;
/** A one-pixel edge this close to the background is anti-aliasing: half transparent, not a halo. */
const FRINGE_TOLERANCE = 60;
/** Shoulders continue outward this many px per px down, from where the circle cut them. */
const SHOULDER_SLOPE = 1.5;
/**
 * The body carries on this far (in 660-unit art) below the frame, hidden under the tile's bottom
 * edge, so tilting or bobbing never lifts it into view. Must match CALL_ART_BELOW in Avatar.tsx.
 */
const BELOW = 150;
const BELOW_PX = (BELOW * N) / 660;

type Rgba = Buffer;
const at = (x: number, y: number) => (y * N + x) * 4;
const dist = (px: Rgba, i: number, c: number[]) =>
  Math.hypot(px[i] - c[0], px[i + 1] - c[1], px[i + 2] - c[2]);

/** Flood-fill the background circle (from just inside its top edge) to transparent. */
function removeBackground(px: Rgba) {
  const seed = at(C, 12);
  const bg = [px[seed], px[seed + 1], px[seed + 2]];
  const removed = new Uint8Array(N * N);
  const stack = [C + 12 * N];
  while (stack.length) {
    const p = stack.pop()!;
    if (removed[p]) continue;
    const i = p * 4;
    if (px[i + 3] === 0 || dist(px, i, bg) > BG_TOLERANCE) continue;
    removed[p] = 1;
    px[i + 3] = 0;
    const x = p % N;
    if (x > 0) stack.push(p - 1);
    if (x < N - 1) stack.push(p + 1);
    if (p >= N) stack.push(p - N);
    if (p < N * (N - 1)) stack.push(p + N);
  }
  for (let p = 0; p < N * N; p++) {
    if (removed[p]) continue;
    const i = p * 4;
    const x = p % N;
    const nextToBg = (x > 0 && removed[p - 1]) || (x < N - 1 && removed[p + 1]) || removed[p - N] || removed[p + N];
    const onRim = Math.hypot(x + 0.5 - C, Math.floor(p / N) + 0.5 - C) >= C - 8;
    // The circle's own anti-aliased rim isn't connected to the fill everywhere: clear it too.
    if (onRim && (px[i + 3] < 255 || nextToBg)) px[i + 3] = 0;
    else if (nextToBg && px[i + 3] > 0 && dist(px, i, bg) < FRINGE_TOLERANCE) px[i + 3] = 128;
  }
}

/** Where the circle cut a shoulder off, continue it outward and down to the bottom corner. */
function extendShoulders(px: Rgba) {
  const onRim = (x: number, y: number) => Math.hypot(x + 0.5 - C, y + 0.5 - C) >= C - 6;
  const opaque = (x: number, y: number) => px[at(x, y) + 3] > 160;
  for (const side of [-1, 1] as const) {
    // Outermost opaque pixel of a row on this side.
    const edge = (y: number) => {
      for (let k = 0; k < C; k++) {
        const x = side < 0 ? k : N - 1 - k;
        if (opaque(x, y)) return x;
      }
      return null;
    };
    let y0 = -1;
    for (let y = Math.round(N * 0.6); y < N && y0 < 0; y++) {
      const x = edge(y);
      if (x !== null && onRim(x, y)) y0 = y;
    }
    if (y0 < 0) continue;
    const x0 = edge(y0)!;
    // The clothing colour just inside the cut, a little below where it starts.
    const s = at(x0 - side * 12, Math.min(N - 1, y0 + 12));
    const colour = [px[s], px[s + 1], px[s + 2]];
    for (let y = y0; y < N; y++) {
      const reach = Math.round((y - y0) * SHOULDER_SLOPE);
      const from = side < 0 ? Math.max(0, x0 - reach) : Math.min(N - 1, x0 + reach);
      const to = edge(y) ?? C;
      // Fill the gap between the new outline and the art (plus the art's anti-aliased rim).
      const [a, b] = side < 0 ? [from, Math.min(to + 2, C)] : [Math.max(to - 2, C), from];
      for (let x = a; x <= b; x++) {
        const i = at(x, y);
        if (px[i + 3] > 160 && !onRim(x, y)) continue;
        px[i] = colour[0];
        px[i + 1] = colour[1];
        px[i + 2] = colour[2];
        px[i + 3] = 255;
      }
    }
  }
}

async function main() {
  for (const id of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    for (const mood of MOODS) {
      const src = ["svg", "png"].map((ext) => path.join(ROOT, id, `${mood}.${ext}`)).find((f) => readdirSync(path.dirname(f)).includes(path.basename(f)));
      if (!src) throw new Error(`${id}: no ${mood} art`);
      const input = src.endsWith(".svg") ? sharp(src, { density: (72 * N) / 660 }) : sharp(src);
      const px = await input.resize(N, N, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer();
      removeBackground(px);
      extendShoulders(px);
      // Repeat the bottom row of clothing downward (see BELOW).
      const tall = Buffer.alloc(N * (N + BELOW_PX) * 4);
      px.copy(tall);
      const last = px.subarray(at(0, N - 1), at(0, N));
      for (let y = N; y < N + BELOW_PX; y++) last.copy(tall, y * N * 4);
      const out = path.join(ROOT, id, `${mood}-call.png`);
      const info = await sharp(tall, { raw: { width: N, height: N + BELOW_PX, channels: 4 } })
        .png({ palette: true, quality: 95, effort: 10 })
        .toFile(out);
      console.log(`${path.relative(ROOT, out)}  ${Math.round(info.size / 1024)} KB`);
    }
  }
}

void main();
