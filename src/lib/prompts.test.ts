import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPromptsModule, GENERATED_PATH } from "../../scripts/gen-prompts";
import fixture from "./__fixtures__/transcript.json";
import { npcPrompt } from "./npcPrompt";
import { ScenarioIdSchema, SetupSchema, type Setup } from "./schemas";
import { fill, MissingPromptVarError, render } from "./prompts";
import { PROMPTS } from "./prompts.generated";

const base = SetupSchema.parse(fixture.setup);
const setups: Record<string, Setup> = {
  recruiter: base,
  networking: { ...base, scenarioId: "networking" },
  party: { ...base, scenarioId: "party" },
  custom: { ...base, scenarioId: "custom", custom: { name: "Morgan", personality: "Nosy pilot.", voiceId: "JBFqnCBsd6RMkjVDRZzb", setting: "" } },
  group: {
    ...base,
    scenarioId: "group",
    group: {
      setting: "",
      characters: [
        { name: "Ana", personality: "Blunt.", voiceId: "JBFqnCBsd6RMkjVDRZzb", expertise: "sales" },
        { name: "Bo", personality: "Kind.", voiceId: "21m00Tcm4TlvDq8ikWAM", expertise: "" },
      ],
    },
  },
};

describe("prompts.generated.ts", () => {
  it("is up to date with prompts/ (run `npm run prompts`)", () => {
    expect(readFileSync(GENERATED_PATH, "utf8")).toBe(buildPromptsModule());
  });

  it("lists the variables each prompt uses", () => {
    expect([...PROMPTS.gap.vars]).toEqual(["alias", "claims", "real_profile"]);
  });
});

describe("fill / render", () => {
  it("throws on a variable without a value instead of sending {{it}} to the model", () => {
    expect(() => fill("Hi {{alias}}, {{missing}}", { alias: "Sam" })).toThrow(MissingPromptVarError);
  });

  it("fills every placeholder", () => {
    expect(render("gap", { alias: "A", claims: "1. x", real_profile: "P" })).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("npcPrompt", () => {
  it("covers every scenario", () => {
    expect(Object.keys(setups).sort()).toEqual([...ScenarioIdSchema.options].sort());
  });

  for (const [id, setup] of Object.entries(setups)) {
    it(`${id}: fills the whole prompt and first message from the repo files`, () => {
      const { prompt, firstMessage, hash } = npcPrompt(setup);
      expect(prompt).not.toMatch(/\{\{\w+\}\}/);
      expect(firstMessage).not.toMatch(/\{\{\w+\}\}/);
      expect(firstMessage.length).toBeGreaterThan(0);
      expect(prompt).toContain(setup.claims[0]);
      expect(hash).toMatch(/^[0-9a-f]{12}\+[0-9a-f]{12}$/);
    });
  }

  it("puts the player-built cast into group prompts", () => {
    const { prompt, firstMessage } = npcPrompt(setups.group);
    expect(prompt).toContain("Ana speaks inside <George> tags");
    expect(firstMessage).toBe("<George>Oh hey! I'm Ana.</George> <Rachel>And I'm Bo. Who are you?</Rachel>");
  });

  it("never lets player text put a {{variable}} in front of ElevenLabs", () => {
    const sneaky = "I run {{system__agent_id}} at {{{acme}}}";
    const setup: Setup = { ...setups.custom, alias: "{{alias}}", claims: [sneaky], custom: { ...setups.custom.custom!, name: "Mo}}rgan{{" } };
    const { prompt, firstMessage } = npcPrompt(setup);
    expect(prompt).not.toMatch(/\{\{|\}\}/);
    expect(firstMessage).not.toMatch(/\{\{|\}\}/);
    expect(prompt).toContain("I run { {system__agent_id} } at { { {acme} } }");
  });
});
