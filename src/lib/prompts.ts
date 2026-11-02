import { PROMPTS } from "./prompts.generated";

/**
 * Prompts are compiled into prompts.generated.ts from prompts/**\/*.md (scripts/gen-prompts.ts), so
 * names and variables are checked by TypeScript: a typo in a prompt name, or a {{variable}} the
 * caller doesn't supply, fails `npm run typecheck`. Nothing is read from disk at runtime.
 */
export type PromptName = keyof typeof PROMPTS;
export type PromptVars<N extends PromptName> = (typeof PROMPTS)[N]["vars"][number];

export function loadPrompt<N extends PromptName>(name: N): (typeof PROMPTS)[N] {
  return PROMPTS[name];
}

/** Content hash of one or more prompt files (frontmatter + body), saved with each game. */
export function promptHash(...names: PromptName[]): string {
  return names.map((n) => PROMPTS[n].hash).join("+");
}

export class MissingPromptVarError extends Error {}

/** Replace {{key}} placeholders. A placeholder without a value is a bug: throw rather than send it to a model. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new MissingPromptVarError(`No value for {{${key}}}`);
    return String(vars[key]);
  });
}

/** Render a prompt's body; TypeScript requires exactly the variables it uses. */
export function render<N extends PromptName>(name: N, vars: { [K in PromptVars<N>]: string | number }): string {
  return fill(PROMPTS[name].body, vars);
}
