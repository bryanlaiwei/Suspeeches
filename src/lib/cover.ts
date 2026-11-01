import type { Cover } from "./client/storage";
import { castName } from "./presets";
import type { Setup } from "./schemas";

const YEARS_SAID: Record<string, string> = { "0–1": "about a year", "2–4": "3 years", "5–9": "6 years", "10+": "over 10 years" };
const VERBS = /^(led|built|ran|grew|made|won|wrote|drove|shipped|launched|scaled|designed|doubled|managed|created|started|founded|raised|cut|saved|moved|migrated|owned|taught)\b/i;

/** Claims the characters will hear, built from the "Build your cover" fields. */
export function claimsFromCover(c: Cover): string[] {
  const out = [`I'm a ${c.title.trim()} with ${YEARS_SAID[c.years] ?? c.years} of experience`];
  for (const raw of c.projects) {
    const p = raw.trim().replace(/\.$/, "");
    if (/^i\b/i.test(p)) out.push(p);
    else if (VERBS.test(p)) out.push(`I ${p.charAt(0).toLowerCase()}${p.slice(1)}`);
    else out.push(`I worked on the ${p}`);
  }
  if (c.skills.length) out.push(`I'm strong in ${c.skills.join(" and ")}`);
  return out.slice(0, 8);
}

/** The scene goal the characters and judge see, from the goal chip. */
export function goalText(goal: Cover["goal"] | undefined, setup: Pick<Setup, "scenarioId" | "custom" | "group">): string {
  const who = castName(setup);
  if (setup.scenarioId === "party") {
    if (goal === "referral") return "Get the panel to recommend you for a role at Lumen";
    if (goal === "vibe") return "Leave the panel impressed without slipping up";
    return "Get an offer to join Lumen";
  }
  if (goal === "referral") return `Get ${who} to refer you for a role on their team`;
  if (goal === "vibe") return `Leave ${who} impressed without slipping up`;
  return `Get ${who} to move you forward to the next interview round`;
}
