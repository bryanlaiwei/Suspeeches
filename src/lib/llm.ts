import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "./env";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  // SDK retries cover network/429/5xx; our loop below covers invalid output.
  client ??= new Anthropic({ apiKey: env.anthropicKey, maxRetries: 2, timeout: 45_000 });
  return client;
}

export class InvalidOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "InvalidOutputError";
  }
}

/** A piece of the user message. `cache` puts a prompt-cache breakpoint right after it. */
export interface PromptBlock {
  text: string;
  cache?: boolean;
}

export interface StructuredRequest<S extends z.ZodType> {
  label: string;
  model: string;
  system: string;
  user: string | PromptBlock[];
  /** Put a prompt-cache breakpoint after the system prompt (worth it when it repeats across calls). */
  cacheSystem?: boolean;
  schema: S;
  maxTokens: number;
  effort: "low" | "medium" | "high";
  /** Per-request overrides of the client defaults (45 s timeout, 2 SDK retries). */
  timeoutMs?: number;
  maxRetries?: number;
}

/** One model call returning raw text. Swappable in tests. */
export type RawCaller = (req: StructuredRequest<z.ZodType>) => Promise<string>;

const EPHEMERAL = { type: "ephemeral" } as const;

/**
 * Prompt caching: a breakpoint caches everything before it for 5 minutes, and the next request
 * reads it back at a tenth of the price (and faster) if its prompt starts with the same blocks. A
 * prefix shorter than the model's minimum (512 tokens on Haiku 5.5) just isn't cached; no error.
 */
export function toMessageParams(req: StructuredRequest<z.ZodType>): Pick<Anthropic.MessageCreateParamsNonStreaming, "system" | "messages"> {
  const system = req.cacheSystem ? [{ type: "text" as const, text: req.system, cache_control: EPHEMERAL }] : req.system;
  const content =
    typeof req.user === "string"
      ? req.user
      : req.user.map((b) => ({ type: "text" as const, text: b.text, ...(b.cache ? { cache_control: EPHEMERAL } : {}) }));
  return { system, messages: [{ role: "user", content }] };
}

export const anthropicCaller: RawCaller = async (req) => {
  const started = Date.now();
  const res = await anthropic().messages.create(
    {
      model: req.model,
      max_tokens: req.maxTokens,
      ...toMessageParams(req),
      output_config: { format: zodOutputFormat(req.schema), effort: req.effort },
    },
    { timeout: req.timeoutMs, maxRetries: req.maxRetries },
  );
  if (process.env.LLM_DEBUG === "1") {
    const u = res.usage;
    console.info(
      `[llm:${req.label}] ${Date.now() - started} ms · input ${u.input_tokens} · cache read ${u.cache_read_input_tokens ?? 0} · cache write ${u.cache_creation_input_tokens ?? 0} · output ${u.output_tokens}`,
    );
  }
  if (res.stop_reason === "refusal") throw new InvalidOutputError("model refused", "");
  if (res.stop_reason === "max_tokens") throw new InvalidOutputError("output truncated", "");
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
};

/**
 * Call the model with a JSON schema, parse and validate with zod.
 * Retries exactly once on invalid output (bad JSON, schema mismatch, refusal, truncation).
 * API errors that a retry cannot fix (auth, bad request) are thrown immediately.
 */
export async function structuredCall<S extends z.ZodType>(
  req: StructuredRequest<S>,
  call: RawCaller = anthropicCaller,
): Promise<{ data: z.infer<S>; attempts: number }> {
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await call(req);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new InvalidOutputError("not JSON", text);
      }
      const parsed = req.schema.safeParse(json);
      if (!parsed.success) throw new InvalidOutputError(parsed.error.message, text);
      return { data: parsed.data, attempts: attempt };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError) throw err;
      last = err;
      console.warn(`[llm:${req.label}] attempt ${attempt} failed:`, (err instanceof Error ? err.message : String(err)).slice(0, 300));
    }
  }
  throw last;
}
