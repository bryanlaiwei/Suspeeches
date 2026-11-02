import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { GapResultSchema, type GapResult, type Profile } from "./schemas";

/**
 * The larp gap sets the score multiplier (up to ×3), so the server never takes it from the browser.
 * /api/gap signs each estimate together with what it was estimated for (player, real profile, alias
 * and claims); POST /api/session only accepts a gap whose signature and inputs still match.
 * Anything else (missing, expired, edited, a changed profile or cover story) is estimated again.
 */

const TTL_MS = 24 * 60 * 60 * 1000;

const g = globalThis as unknown as { __susAppSecret?: Buffer; __susAppSecretWarned?: boolean };

/**
 * APP_SECRET signs gap estimates. Without it each server process makes up its own, so a token from
 * another instance or before a restart just fails to verify and the gap is estimated again.
 */
function secret(): Buffer {
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv) return Buffer.from(fromEnv);
  if (process.env.NODE_ENV === "production" && !g.__susAppSecretWarned) {
    g.__susAppSecretWarned = true;
    console.warn("[gap] APP_SECRET is not set: larp-gap estimates are re-run at scene start after any restart.");
  }
  return (g.__susAppSecret ??= randomBytes(32));
}

/** What an estimate is valid for. Email is left out: the server sets it from the sign-in. */
export function gapBinding(userId: string | null, profile: Profile, alias: string, claims: string[]): string {
  const p = [profile.name, profile.role, profile.skills, profile.yearsExperience, profile.education, profile.facts];
  return createHash("sha256")
    .update(JSON.stringify([userId ?? "", p, alias.trim(), claims.map((c) => c.trim())]))
    .digest("base64url");
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function signGap(gap: GapResult, binding: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ gap, b: binding, exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The signed gap, if the token is genuine, unexpired and was made for exactly this binding. */
export function verifyGap(token: string | undefined, binding: string, now = Date.now()): GapResult | null {
  if (!token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { gap: unknown; b: unknown; exp: unknown };
    if (data.b !== binding || typeof data.exp !== "number" || data.exp < now) return null;
    const gap = GapResultSchema.safeParse(data.gap);
    return gap.success ? gap.data : null;
  } catch {
    return null;
  }
}
