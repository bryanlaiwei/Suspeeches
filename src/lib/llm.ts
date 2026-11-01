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

export interface StructuredRequest<S extends z.ZodType> {
  label: string;
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  effort: "low" | "medium" | "high";
}

/** One model call returning raw text. Swappable in tests. */
export type RawCaller = (req: Omit<StructuredRequest<z.ZodType>, "label">) => Promise<string>;

export const anthropicCaller: RawCaller = async (req) => {
  const res = await anthropic().messages.create({
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    output_config: { format: zodOutputFormat(req.schema), effort: req.effort },
  });
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
