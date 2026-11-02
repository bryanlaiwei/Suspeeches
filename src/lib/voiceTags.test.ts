import { describe, expect, it } from "vitest";
import { parseSegments, stripAudioTags } from "./voiceTags";

describe("parseSegments", () => {
  it("returns untagged text as one unlabelled segment", () => {
    expect(parseSegments("Hi there, who are you?")).toEqual([{ label: null, text: "Hi there, who are you?" }]);
  });

  it("splits a multi-voice response by speaker, keeping text outside tags", () => {
    expect(parseSegments("Okay. <Maya>I'm Maya.</Maya> <Theo>And I'm Theo.</Theo> Anyway")).toEqual([
      { label: null, text: "Okay." },
      { label: "Maya", text: "I'm Maya." },
      { label: "Theo", text: "And I'm Theo." },
      { label: null, text: "Anyway" },
    ]);
  });

  it("handles a still-streaming response whose last tag isn't closed", () => {
    expect(parseSegments("<Maya>Hi.</Maya> <Theo>So tell me")).toEqual([
      { label: "Maya", text: "Hi." },
      { label: "Theo", text: "So tell me" },
    ]);
  });

  it("drops a half-written tag at the very end", () => {
    expect(parseSegments("<Maya>Hi.</Maya> <The")).toEqual([{ label: "Maya", text: "Hi." }]);
    expect(parseSegments("<Maya>Hi.</Ma")).toEqual([{ label: "Maya", text: "Hi." }]);
    expect(parseSegments("<Maya>Hi.<")).toEqual([{ label: "Maya", text: "Hi." }]);
    expect(parseSegments("Hello <")).toEqual([{ label: null, text: "Hello" }]);
  });

  it("strips audio tags and drops segments that were only audio tags", () => {
    expect(parseSegments("<Maya>[laughs]</Maya> <Theo>[curious] Really? [sighs] Okay.</Theo>")).toEqual([
      { label: "Theo", text: "Really? Okay." },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(parseSegments("")).toEqual([]);
  });
});

describe("stripAudioTags", () => {
  it("removes [tags] and tidies the spacing", () => {
    expect(stripAudioTags("[warmly] Hi  there [pause] friend")).toBe("Hi there friend");
  });

  it("leaves bracketed text that isn't a tag", () => {
    expect(stripAudioTags("Version [2]")).toBe("Version [2]");
  });
});
