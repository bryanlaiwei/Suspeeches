import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/transcript.json";
import { JOB_LOCK_MS, jobDue, runDebriefJob } from "./debrief";
import { ProfileSchema, SetupSchema } from "./schemas";
import { MemoryStore, sessionStore, setSessionStore } from "./sessionStore";
import {
  addEvent,
  createSession,
  endSession,
  LATE_GRACE_SEC,
  loadSession,
  markConnected,
  NOTES_HOLD_MS,
  settleExpired,
  updateSession,
  type Session,
} from "./sessions";
import type { ScoreResponse } from "./types";

/** Control the debrief writer: make the next calls fail, or take a while (on the fake clock). */
const summarizer = vi.hoisted(() => ({ failures: 0, delaySec: 0 }));
vi.mock("./summarize", async (importOriginal) => {
  const real = await importOriginal<typeof import("./summarize")>();
  return {
    ...real,
    buildDebrief: async (s: Session) => {
      if (summarizer.failures-- > 0) throw new Error("summarizer down");
      vi.setSystemTime(Date.now() + summarizer.delaySec * 1000);
      return real.buildDebrief(s);
    },
  };
});

const profile = ProfileSchema.parse(fixture.profile);
const setup = SetupSchema.parse(fixture.setup);
const gap = { gapScore: 50, multiplier: 2, rationale: "", hardestClaims: [] };
const timing = { responseLatencyMs: 500, speechMs: 1000 };
const LIMIT = setup.timeLimitSec;

const newSession = () => createSession(profile, setup, gap, null);
const load = async (id: string) => (await loadSession(id))!;
/** Move the server clock forward. */
const advance = (sec: number) => vi.setSystemTime(Date.now() + sec * 1000);

beforeEach(() => {
  setSessionStore(new MemoryStore());
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  Object.assign(summarizer, { failures: 0, delaySec: 0 });
});

describe("transcript order", () => {
  it("keeps lines in the order the browser heard them when the requests arrive out of order", async () => {
    const { id } = await newSession();
    await addEvent(id, "agent", "Q1", timing, 0);
    await addEvent(id, "user", "A1", timing, 1);
    await addEvent(id, "agent", "Q2", timing, 3); // sent after A2 but arrived first
    const a2 = await addEvent(id, "user", "A2", timing, 2);

    expect((await load(id)).transcript.map((t) => [t.index, t.text])).toEqual([
      [0, "Q1"],
      [1, "A1"],
      [2, "A2"],
      [3, "Q2"],
    ]);
    expect(a2?.response.judged?.event.turnIndex).toBe(2);
  });

  it("keeps the parts of one group response in order", async () => {
    const { id } = await newSession();
    for (const [i, text] of ["Maya part", "Theo part", "Jordan part"].entries()) await addEvent(id, "agent", text, timing, i, "x");
    expect((await load(id)).transcript.map((t) => t.text)).toEqual(["Maya part", "Theo part", "Jordan part"]);
  });

  it("moves judged events along when a late line is slotted in before them", async () => {
    const { id } = await newSession();
    await addEvent(id, "agent", "Q1", timing, 1);
    await addEvent(id, "user", "A1", timing, 2);
    await addEvent(id, "agent", "Q0", timing, 0);
    const s = await load(id);
    expect(s.transcript.map((t) => t.text)).toEqual(["Q0", "Q1", "A1"]);
    expect(s.events.map((e) => e.turnIndex)).toEqual([2]);
    for (const e of s.events) expect(s.transcript[e.turnIndex].text).toBe("A1");
  });

  it("records a retried line once", async () => {
    const { id } = await newSession();
    await addEvent(id, "user", "A1", timing, 0);
    const again = await addEvent(id, "user", "A1", timing, 0);
    expect(again?.response.judged).toBeNull();
    const s = await load(id);
    expect(s.transcript).toHaveLength(1);
    expect(s.events).toHaveLength(1);
  });

  it("times lines by the server's clock, in spoken order", async () => {
    const { id } = await newSession();
    await markConnected(id);
    advance(10);
    await addEvent(id, "agent", "later line", timing, 1);
    advance(5);
    await addEvent(id, "agent", "earlier line, arrived late", timing, 0);
    const s = await load(id);
    expect(s.transcript.map((t) => [t.text, t.tSec])).toEqual([
      ["earlier line, arrived late", 10],
      ["later line", 10],
    ]);
  });
});

describe("the clock", () => {
  it("doesn't take the browser's word for a timeout", async () => {
    const { id } = await newSession();
    await markConnected(id);
    advance(3);
    await endSession(id, "timeout");
    const s = await load(id);
    expect(s.endReason).toBe("left");
    expect(s.status).toBe("left");
    expect(s.durationSec).toBe(3);
  });

  it("starts when the call connects, not when the session is created", async () => {
    const { id } = await newSession();
    advance(60); // microphone prompt, connecting...
    await markConnected(id);
    advance(LIMIT - 30);
    await endSession(id, "timeout");
    const s = await load(id);
    expect(s.endReason).toBe("left");
    expect(s.durationSec).toBe(LIMIT - 30);
  });

  it("accepts a timeout once the limit has passed since the call connected", async () => {
    const { id } = await newSession();
    await markConnected(id);
    advance(LIMIT);
    await endSession(id, "timeout");
    const s = await load(id);
    expect(s.endReason).toBe("timeout");
    expect(s.status).toBe("survived");
    expect(s.durationSec).toBe(LIMIT);
  });

  it("refuses a timeout for a call that never connected", async () => {
    const { id } = await newSession();
    advance(LIMIT + 5);
    await endSession(id, "timeout");
    const s = await load(id);
    expect(s.endReason).toBe("left");
    expect(s.durationSec).toBe(0);
  });

  it("never records a call longer than the time limit", async () => {
    const { id } = await newSession();
    await markConnected(id);
    advance(LIMIT + 100);
    await endSession(id, "left");
    expect((await load(id)).durationSec).toBe(LIMIT);
  });

  it("ends the scene as a timeout when lines keep coming after the limit", async () => {
    const { id } = await newSession();
    await markConnected(id);
    advance(LIMIT + LATE_GRACE_SEC);
    const out = await addEvent(id, "user", "Still talking", timing, 0);
    expect(out?.ended).toBe(true);
    const s = await load(id);
    expect(s.endReason).toBe("timeout");
    expect(s.transcript).toHaveLength(0);
    expect(s.job.status).toBe("pending");
  });

  it("settles a scene nobody ended once its time is up, and only then", async () => {
    const { id } = await newSession();
    await markConnected(id);
    advance(LIMIT - 10);
    expect((await settleExpired(id))?.ended).toBe(false);
    advance(10);
    expect((await settleExpired(id))?.ended).toBe(true);
    expect((await load(id)).endReason).toBe("timeout");
  });

  it("treats a dropped call as cut short, not a survive", async () => {
    for (const reason of ["error", "npc_ended"] as const) {
      const { id } = await newSession();
      await endSession(id, reason);
      expect((await load(id)).status).toBe("left");
    }
  });
});

describe("storage", () => {
  it("retries on a version conflict instead of overwriting the other request's change", async () => {
    const { id } = await newSession();
    const store = sessionStore() as MemoryStore;
    const update = store.update.bind(store);
    let raced = false;
    store.update = async (s: Session, version: number) => {
      if (!raced) {
        raced = true; // another request saves between our read and our write
        const other = (await store.get(id))!;
        other.session.silenceCount = 99;
        await update(other.session, other.version);
      }
      return update(s, version);
    };
    await markConnected(id);
    const s = await load(id);
    expect(s.silenceCount).toBe(99);
    expect(s.connectedAt).not.toBeNull();
  });

  it("hands out copies, so state only changes through updates", async () => {
    const { id } = await newSession();
    (await load(id)).suspicion = 100;
    expect((await load(id)).suspicion).toBe(20);
    await updateSession(id, (s) => void (s.suspicion = 42));
    expect((await load(id)).suspicion).toBe(42);
  });

  it("costs four round trips for a judged turn (read, save the line, save the score, save the notes)", async () => {
    const { id } = await newSession();
    const store = sessionStore() as MemoryStore;
    const calls: string[] = [];
    const [get, update] = [store.get.bind(store), store.update.bind(store)];
    store.get = (x) => (calls.push("get"), get(x));
    store.update = (s, v) => (calls.push("update"), update(s, v));
    await addEvent(id, "user", "I led the migration to Kubernetes in 2021.", timing, 0);
    expect(calls).toEqual(["get", "update", "update", "update"]);
  });
});

describe("streamed score", () => {
  it("applies the score before the judge's notes, then completes the same event", async () => {
    const { id } = await newSession();
    const early: ScoreResponse[] = [];
    const out = await addEvent(id, "user", "Um, I think we kind of moved stuff.", timing, 0, undefined, (r) => early.push(r));

    expect(early).toHaveLength(1);
    expect(early[0].event.reasons).toEqual([]);
    expect(early[0].state.suspicion).toBe(20 + early[0].event.delta);
    expect(early[0].event.delta).toBeGreaterThan(0);

    const done = out!.response.judged!;
    expect(done.event.delta).toBe(early[0].event.delta);
    expect(done.event.reasons.length).toBeGreaterThan(0);
    expect(done.npcHint).not.toBe("");
    const s = await load(id);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].reasons).toEqual(done.event.reasons);
    expect(s.suspicion).toBe(early[0].state.suspicion);
  });

  it("holds the debrief while the notes on the turn that got you caught are still coming", async () => {
    const { id } = await newSession();
    await updateSession(id, (s) => void (s.suspicion = 99));
    const store = sessionStore() as MemoryStore;
    const update = store.update.bind(store);
    const saved: Session["job"][] = [];
    store.update = (s, v) => (saved.push({ ...s.job }), update(s, v));

    const early: ScoreResponse[] = [];
    const out = await addEvent(id, "user", "Um, I guess, maybe stuff.", timing, 0, undefined, (r) => early.push(r));
    expect(early[0].state.status).toBe("caught");
    expect(out?.ended).toBe(true);
    // Saves: the line, the score (caught, debrief held), the notes (debrief released).
    expect(saved.map((j) => j.status)).toEqual(["none", "pending", "pending"]);
    expect(saved[1].lockedUntil).toBe(Date.now() + NOTES_HOLD_MS);
    expect(saved[2].lockedUntil).toBeNull();

    const s = await load(id);
    expect(s.events[0].reasons.length).toBeGreaterThan(0);
    expect(jobDue(s)).toBe(true);
  });

  it("doesn't start a held debrief until the hold runs out", async () => {
    const { id } = await newSession();
    await endSession(id, "left");
    await updateSession(id, (s) => void (s.job.lockedUntil = Date.now() + NOTES_HOLD_MS));
    expect(jobDue(await load(id))).toBe(false);
    advance(NOTES_HOLD_MS / 1000);
    expect(jobDue(await load(id))).toBe(true);
  });
});

describe("debrief job", () => {
  const ended = async () => {
    const { id } = await newSession();
    await endSession(id, "left");
    return id;
  };

  it("writes the debrief", async () => {
    const id = await ended();
    await runDebriefJob(id);
    const s = await load(id);
    expect(s.job.status).toBe("done");
    expect(s.debrief?.endReason).toBe("left");
    expect(jobDue(s)).toBe(false);
  });

  it("marks a failed run, and the next run finishes it", async () => {
    summarizer.failures = 1;
    const id = await ended();
    await runDebriefJob(id);
    let s = await load(id);
    expect(s.job.status).toBe("failed");
    expect(s.job.error).toContain("summarizer down");
    expect(s.debrief).toBeNull();
    expect(jobDue(s)).toBe(true);

    await runDebriefJob(id);
    s = await load(id);
    expect(s.job).toMatchObject({ status: "done", attempts: 2 });
    expect(s.debrief).not.toBeNull();
  });

  it("leaves a running job alone until its lock expires", async () => {
    const id = await ended();
    await updateSession(id, (s) => void (s.job = { status: "running", attempts: 1, error: null, lockedUntil: Date.now() + 60_000 }));
    await runDebriefJob(id);
    expect((await load(id)).job.status).toBe("running");
    expect((await load(id)).debrief).toBeNull();

    advance(61); // the worker that held it died
    await runDebriefJob(id);
    expect((await load(id)).job.status).toBe("done");
    expect((await load(id)).debrief).not.toBeNull();
  });

  it("doesn't run while the scene is live", async () => {
    const { id } = await newSession();
    await runDebriefJob(id);
    expect((await load(id)).debrief).toBeNull();
  });

  it("renews its lock after each step, so a slow step doesn't let a second worker start", async () => {
    const id = await ended();
    summarizer.delaySec = 4 * 60; // writing the debrief took 4 minutes
    const store = sessionStore();
    const update = store.update.bind(store);
    const locks: number[] = [];
    store.update = (s, v) => {
      if (s.job.status === "running" && s.job.lockedUntil) locks.push(s.job.lockedUntil);
      return update(s, v);
    };
    const claimedAt = Date.now();
    await runDebriefJob(id);
    // The save after the slow step pushed the lock out again from that moment, not from the claim.
    expect(Math.max(...locks)).toBe(claimedAt + 4 * 60_000 + JOB_LOCK_MS);
    expect((await load(id)).job).toMatchObject({ status: "done", lockedUntil: null });
  });
});
