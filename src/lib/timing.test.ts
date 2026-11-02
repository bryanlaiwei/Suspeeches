import { describe, expect, it } from "vitest";
import { countWords, deliverySignals, findFillers } from "./timing";

describe("findFillers", () => {
  it("finds single-word fillers case-insensitively, through punctuation", () => {
    expect(findFillers("Um, so, UH... I did it.")).toEqual(["um", "uh"]);
  });

  it("counts every occurrence", () => {
    expect(findFillers("um um um")).toEqual(["um", "um", "um"]);
  });

  it("finds multi-word fillers, including across extra spaces", () => {
    expect(findFillers("It was, you   know, sort of a big deal. I mean it.")).toEqual(["you know", "i mean", "sort of"]);
  });

  it("only matches whole words", () => {
    expect(findFillers("I likely dislike the umbrella; unlike Erma, that's my umbra.")).toEqual([]);
  });

  it("returns nothing for clean or empty text", () => {
    expect(findFillers("I led the migration to Kubernetes in 2021.")).toEqual([]);
    expect(findFillers("")).toEqual([]);
  });
});

describe("deliverySignals", () => {
  it("derives word count, filler rate, pace and long pauses", () => {
    const s = deliverySignals("Um, I basically led the whole migration myself", { responseLatencyMs: 4500, speechMs: 4000 });
    expect(countWords("Um, I basically led the whole migration myself")).toBe(8);
    expect(s).toMatchObject({ words: 8, fillerCount: 2, fillerRate: 25, wordsPerMinute: 120, longPause: true });
  });

  it("leaves pace unknown for very short or unmeasured speech", () => {
    expect(deliverySignals("Yes.", { responseLatencyMs: null, speechMs: 500 }).wordsPerMinute).toBeNull();
    expect(deliverySignals("Yes.", { responseLatencyMs: null, speechMs: null }).longPause).toBe(false);
  });
});
