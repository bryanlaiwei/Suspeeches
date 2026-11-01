import { loadPrompt } from "./prompts";
import type { Mood } from "./scoring";

/** Mood notes from prompts/npc/_moods.v1.md, split on "## <mood>" headings. */
export function moodNote(mood: Mood): string {
  const sections = loadPrompt("npc/_moods.v1").body.split(/^## /m).slice(1);
  for (const section of sections) {
    const nl = section.indexOf("\n");
    if (section.slice(0, nl).trim() === mood) return section.slice(nl + 1).trim();
  }
  return "";
}
