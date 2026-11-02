import { describe, expect, it } from "vitest";
import agents from "./agents.json";
import { PROMPTS } from "./prompts.generated";
import { castFor, presetFor } from "./presets";
import { ScenarioIdSchema } from "./schemas";
import { isGroupScenario, SCENARIO_IDS, SCENARIOS } from "./scenarios";

describe("scenario registry", () => {
  it("is where the zod enum gets its ids", () => {
    expect(ScenarioIdSchema.options).toEqual(SCENARIO_IDS);
  });

  for (const id of SCENARIO_IDS) {
    it(`${id}: has a character file with the agent's voice, LLM and first message`, () => {
      const file = PROMPTS[`npc/${id}`];
      expect(file, `prompts/npc/${id}.md is missing`).toBeDefined();
      expect(file.meta.voice_id).toBeTruthy();
      expect(file.meta.llm).toBeTruthy();
      expect(file.meta.first_message).toBeTruthy();
      // Multi-voice agents need the voice list.
      expect("voices" in file.meta).toBe(isGroupScenario(id));
    });
  }

  it("keeps names and titles only in the registry, not in the character files", () => {
    for (const id of SCENARIO_IDS) {
      for (const dup of ["agent_name", "character", "title", "name"]) expect(PROMPTS[`npc/${id}`].meta).not.toHaveProperty(dup);
    }
  });

  it("gives every agent its own name", () => {
    const names = SCENARIO_IDS.map((id) => SCENARIOS[id].agentName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only records agents for scenarios that exist", () => {
    for (const key of Object.keys(agents)) expect(SCENARIO_IDS).toContain(key);
  });

  it("puts a panel's cast on stage and a fixed character alone", () => {
    expect(castFor({ scenarioId: "party" }).map((c) => c.name)).toEqual(["Maya", "Theo", "Jordan"]);
    expect(castFor({ scenarioId: "recruiter" })).toEqual([expect.objectContaining({ name: "Dana", title: presetFor("recruiter").title })]);
  });
});
