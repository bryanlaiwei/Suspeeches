import { fill, loadPrompt } from "./prompts";
import type { Mood } from "./scoring";

/** Mood notes from prompts/npc/_moods.v1.md, split on "## <mood>" headings. */
function section(name: string): string {
  return moodNote(name as Mood);
}

/**
 * Group scenes: either everyone's current mood (each character keeps their own tone), or the
 * "caught" decision naming who ends it.
 */
export function groupMoodNote(arg: { moods: Record<string, Mood> } | { caughtBy: string }): string {
  if ("caughtBy" in arg) return fill(section("caught_group"), { name: arg.caughtBy });
  const lines = Object.entries(arg.moods).map(([name, mood]) => `- ${name}: ${section(`${mood}_short`)}`);
  return fill(section("group"), { moods: lines.join("\n") });
}

export function moodNote(mood: Mood | "caught"): string {
  const sections = loadPrompt("npc/_moods.v1").body.split(/^## /m).slice(1);
  for (const section of sections) {
    const nl = section.indexOf("\n");
    if (section.slice(0, nl).trim() === mood) return section.slice(nl + 1).trim();
  }
  return "";
}
