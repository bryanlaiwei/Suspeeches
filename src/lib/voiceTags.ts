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
/** The start of a tag still streaming in at the very end, e.g. "<", "</Ma" or "<The". */
const PARTIAL_TAG = /<\/?(?:[A-Za-z][\w-]*)?$/;

export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const before = stripAudioTags(text.slice(last, m.index));
    if (before) out.push({ label: null, text: before });
    const inner = stripAudioTags(m[2].replace(PARTIAL_TAG, ""));
    if (inner) out.push({ label: m[1], text: inner });
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = stripAudioTags(text.slice(last).replace(PARTIAL_TAG, ""));
  if (rest) out.push({ label: null, text: rest });
  return out;
}

/** ElevenLabs expressive audio tags like [curious] or [laughs]: performed by the voice, not spoken. */
export function stripAudioTags(text: string): string {
  return text.replace(/\[[a-z][^\]]{0,40}\]\s*/gi, "").replace(/\s{2,}/g, " ").trim();
}

