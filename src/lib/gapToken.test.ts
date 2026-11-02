import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/transcript.json";
import { gapBinding, signGap, verifyGap } from "./gapToken";
import { ProfileSchema } from "./schemas";

const profile = ProfileSchema.parse(fixture.profile);
const claims = fixture.setup.claims;
const gap = { gapScore: 72, multiplier: 2.44, rationale: "A barista claiming to be a backend lead.", hardestClaims: [claims[1]] };
const binding = gapBinding("user-1", profile, "Sam", claims);

describe("signed larp gap", () => {
  it("accepts its own estimate for the same player, profile and cover story", () => {
    expect(verifyGap(signGap(gap, binding), gapBinding("user-1", profile, " Sam ", claims))).toEqual(gap);
  });

  it("rejects an edited gap", () => {
    const [payload, sig] = signGap(gap, binding).split(".");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    data.gap.gapScore = 100;
    const forged = `${Buffer.from(JSON.stringify(data)).toString("base64url")}.${sig}`;
    expect(verifyGap(forged, binding)).toBeNull();
  });

  it("rejects an estimate made for a different cover story, profile or player", () => {
    const token = signGap(gap, binding);
    expect(verifyGap(token, gapBinding("user-1", profile, "Sam", [...claims, "I won a Turing award"]))).toBeNull();
    expect(verifyGap(token, gapBinding("user-1", { ...profile, role: "Staff engineer" }, "Sam", claims))).toBeNull();
    expect(verifyGap(token, gapBinding("user-2", profile, "Sam", claims))).toBeNull();
  });

  it("rejects expired, missing and malformed tokens", () => {
    const token = signGap(gap, binding, Date.now() - 25 * 60 * 60 * 1000);
    expect(verifyGap(token, binding)).toBeNull();
    expect(verifyGap(undefined, binding)).toBeNull();
    expect(verifyGap("nonsense", binding)).toBeNull();
    expect(verifyGap("a.b.c", binding)).toBeNull();
  });
});
