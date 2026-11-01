/**
 * ElevenLabs multi-voice markup: the group agent wraps each character's words in
 * <Label>...</Label>. These helpers split agent text by speaker (also works on a partial,
 * still-streaming response whose last tag isn't closed yet).
 */
export interface Segment {
  /** Voice label, or null for text outside any tag (spoken in the default voice). */
  label: string | null;
  text: string;
}

const TAG = /<([A-Za-z][\w-]*)>([\s\S]*?)(?:<\/\1>|$)/g;

export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ label: null, text: before });
    const inner = m[2].trim();
    if (inner) out.push({ label: m[1], text: inner });
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last).replace(/<\/?[A-Za-z][\w-]*>?$/, "").trim();
  if (rest) out.push({ label: null, text: rest });
  return out;
}

export function stripTags(text: string): string {
  return parseSegments(text)
    .map((s) => s.text)
    .join(" ");
}
