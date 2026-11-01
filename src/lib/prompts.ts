import { readFileSync } from "node:fs";
import path from "node:path";

export interface PromptFile {
  meta: Record<string, string>;
  body: string;
}

const cache = new Map<string, PromptFile>();

/** Load prompts/<name>.md (frontmatter of simple `key: value` lines + body). */
export function loadPrompt(name: string): PromptFile {
  const hit = cache.get(name);
  if (hit && process.env.NODE_ENV === "production") return hit;

  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  const raw = readFileSync(file, "utf8");
  const parsed = parseFrontmatter(raw);
  cache.set(name, parsed);
  return parsed;
}

export function parseFrontmatter(raw: string): PromptFile {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: match[2].trim() };
}

/** Replace {{key}} placeholders. Unknown keys are left as-is so mistakes are visible. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/** Render a prompt file's body with variables. */
export function render(name: string, vars: Record<string, string | number>): string {
  return fill(loadPrompt(name).body, vars);
}
