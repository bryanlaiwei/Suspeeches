import { fill, loadPrompt } from "./prompts";
import type { Mood } from "./scoring";

/** The headings in prompts/npc/_moods.md. */
type MoodSection = Mood | `${Mood}_short` | "caught" | "caught_group" | "group";

/** A note from prompts/npc/_moods.md, which is split on "## <name>" headings ("" if missing). */
export function moodNote(name: MoodSection): string {
  for (const part of loadPrompt("npc/_moods").body.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    if (part.slice(0, nl).trim() === name) return part.slice(nl + 1).trim();
  }
  return "";
}

/**
 * Group scenes: either everyone's current mood (each character keeps their own tone), or the
 * "caught" decision naming who ends it.
 */
export function groupMoodNote(arg: { moods: Record<string, Mood> } | { caughtBy: string }): string {
  if ("caughtBy" in arg) return fill(moodNote("caught_group"), { name: arg.caughtBy });
  const lines = Object.entries(arg.moods).map(([name, mood]) => `- ${name}: ${moodNote(`${mood}_short`)}`);
  return fill(moodNote("group"), { moods: lines.join("\n") });
}
