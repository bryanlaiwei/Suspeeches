import { z } from "zod";

/* ---------- user input ---------- */

export const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().max(200).optional().default(""),
  role: z.string().trim().max(120).default(""),
  skills: z.array(z.string().trim().max(60)).max(30).default([]),
  yearsExperience: z.number().min(0).max(60).default(0),
  education: z.string().trim().max(200).default(""),
  facts: z.array(z.string().trim().max(240)).max(12).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ScenarioIdSchema = z.enum(["recruiter", "networking", "custom", "party", "group"]);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

export const CustomCharacterSchema = z.object({
  name: z.string().trim().min(1).max(60),
  personality: z.string().trim().min(1).max(600),
  voiceId: z.string().trim().min(1).max(64),
  setting: z.string().trim().max(300).default(""),
});
export type CustomCharacter = z.infer<typeof CustomCharacterSchema>;

/** A player-built group scene: 2-3 characters, each with a distinct ElevenLabs voice. */
export const GroupSchema = z
  .object({
    setting: z.string().trim().max(300).default(""),
    characters: z
      .array(
        CustomCharacterSchema.omit({ setting: true }).extend({
          /** What they know well enough to catch a faker. */
          expertise: z.string().trim().max(200).default(""),
        }),
      )
      .min(2)
      .max(3),
  })
  .refine((g) => new Set(g.characters.map((c) => c.voiceId)).size === g.characters.length, {
    message: "Give each character a different voice",
    path: ["characters"],
  })
  .refine((g) => new Set(g.characters.map((c) => c.name.toLowerCase())).size === g.characters.length, {
    message: "Give each character a different name",
    path: ["characters"],
  });
export type Group = z.infer<typeof GroupSchema>;

export const SetupSchema = z.object({
  scenarioId: ScenarioIdSchema,
  custom: CustomCharacterSchema.optional(),
  group: GroupSchema.optional(),
  alias: z.string().trim().min(1).max(80),
  claims: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  goal: z.string().trim().min(1).max(240),
  timeLimitSec: z.number().int().min(60).max(600),
  emailHandler: z.boolean().default(false),
});
export type Setup = z.infer<typeof SetupSchema>;

/* ---------- judge ---------- */

export const ClaimStatusSchema = z.enum(["held", "shaky", "contradicted", "untested"]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

const score010 = z.number().int().min(0).max(10);

/** Exactly the contract the judge must meet after server-side clamping. */
export const JudgeResultSchema = z.object({
  delta: z.number().int().min(-15).max(25),
  reasons: z.array(z.string()).min(1).max(5),
  categories: z.object({
    consistency: score010,
    specificity: score010,
    plausibility: score010,
    delivery: score010,
  }),
  claims_status: z.array(z.object({ claim: z.string(), status: ClaimStatusSchema })),
  next_probe: z.string(),
  /** Group scenes: each listener's own reaction (empty for 1-on-1 scenes). */
  listeners: z.array(z.object({ name: z.string(), delta: z.number().int().min(-15).max(25), reason: z.string() })),
});
export type JudgeResult = z.infer<typeof JudgeResultSchema>;

/**
 * What we ask the model for. Number ranges are left open here because the server clamps
 * them; anything structurally wrong (missing keys, bad enums) still fails and triggers a retry.
 */
export const JudgeRawSchema = z.object({
  delta: z.number(),
  reasons: z.array(z.string()),
  categories: z.object({
    consistency: z.number(),
    specificity: z.number(),
    plausibility: z.number(),
    delivery: z.number(),
  }),
  claims_status: z.array(z.object({ claim: z.string(), status: ClaimStatusSchema })),
  next_probe: z.string(),
  listeners: z.array(z.object({ name: z.string(), delta: z.number(), reason: z.string() })),
});
export type JudgeRaw = z.infer<typeof JudgeRawSchema>;

/* ---------- gap estimator + suggester ---------- */

export const GapRawSchema = z.object({
  gap_score: z.number(),
  rationale: z.string(),
  hardest_claims: z.array(z.string()),
});

export const GapResultSchema = z.object({
  gapScore: z.number().int().min(0).max(100),
  multiplier: z.number().min(1).max(3),
  rationale: z.string(),
  hardestClaims: z.array(z.string()),
});
export type GapResult = z.infer<typeof GapResultSchema>;

export const SuggestRawSchema = z.object({
  suggestions: z.array(z.object({ claim: z.string(), why: z.string() })),
});
export type SuggestRaw = z.infer<typeof SuggestRawSchema>;

/* ---------- summarizer ---------- */

export const ClaimVerdictSchema = z.enum(["held", "shaky", "blown", "untested"]);

export const DebriefRawSchema = z.object({
  outcome: z.enum(["survived", "caught"]),
  final_suspicion: z.number(),
  headline: z.string(),
  timeline: z.array(z.object({ turn_index: z.number(), reason: z.string() })),
  claims: z.array(z.object({ claim: z.string(), verdict: ClaimVerdictSchema, note: z.string() })),
  tips: z.array(z.string()),
  larp_gap: z.number(),
});
export type DebriefRaw = z.infer<typeof DebriefRawSchema>;

/* ---------- character follow-up email ---------- */

export const FollowupRawSchema = z.object({
  goal_reached: z.boolean(),
  sender: z.string(),
  subject: z.string(),
  body: z.string(),
});
export type FollowupRaw = z.infer<typeof FollowupRawSchema>;

/* ---------- API request bodies ---------- */

export const TimingSchema = z.object({
  /** ms from the NPC finishing its line to the user starting to speak (null if unknown). */
  responseLatencyMs: z.number().min(0).max(120_000).nullable(),
  /** ms the user spent speaking for this turn (null if unknown). */
  speechMs: z.number().min(0).max(300_000).nullable(),
  /** seconds since the scene started. */
  tSec: z.number().min(0).max(3600),
});
export type Timing = z.infer<typeof TimingSchema>;

export const EventBodySchema = z.object({
  role: z.enum(["user", "agent"]),
  speaker: z.string().trim().max(60).optional(),
  text: z.string().trim().min(1).max(4000),
  timing: TimingSchema,
});

export const SilenceBodySchema = z.object({
  /** Scene time (s) when the player's turn started (the NPC stopped talking). */
  silentSinceSec: z.number().min(0).max(3600),
  tSec: z.number().min(0).max(3600),
});

export const EndBodySchema = z.object({
  reason: z.enum(["timeout", "npc_ended", "left", "error"]),
  tSec: z.number().min(0).max(3600),
});

export const CreateSessionBodySchema = z.object({
  profile: ProfileSchema,
  setup: SetupSchema,
  gap: GapResultSchema.optional(),
});

export const GapBodySchema = z.object({
  profile: ProfileSchema,
  alias: z.string().default(""),
  claims: z.array(z.string()).min(1).max(8),
});

export const SuggestBodySchema = z.object({
  profile: ProfileSchema,
  scenarioId: ScenarioIdSchema,
  existing: z.array(z.string()).default([]),
});
