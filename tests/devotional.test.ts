import { describe, expect, it } from "vitest";
import { nextStreak } from "../server/routers/devotional";
import { periodForHour } from "../server/routers/prayers";
import { AiError, validateDevotional } from "../server/services/ai";
import { verseForDate } from "../shared/daily-verses";
import { createHarness, expectTrpcError, fakeDevotional } from "./helpers";

const DAY = 86_400_000;

describe("devotional generation", () => {
  it("generates once per day and returns the cached devotional afterwards", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Grace");
    const first = await caller.devotional.generate({ situation: "Starting a new job" });
    const second = await caller.devotional.generate();
    expect(second.id).toBe(first.id);
    expect(h.writer.devotionalCalls).toBe(1);
    expect(first.insights).toHaveLength(3);
    expect(first.reference).toMatch(/\d+:\d+/);
    expect((await caller.devotional.today()).devotional?.id).toBe(first.id);
  });

  it("passes the Scripture text and denomination to the writer, and uses the user's local date", async () => {
    const h = await createHarness();
    // 03:00 UTC on Oct 24 is still Oct 23 in Chicago.
    h.clock.now = new Date("2026-10-24T03:00:00Z");
    const { caller } = await h.signUp("Lydia", { timezone: "America/Chicago" });
    await caller.user.updateProfile({ denomination: "Baptist" });
    const d = await caller.devotional.generate();
    expect(d.date).toBe("2026-10-23");
    const input = h.writer.lastInput as { verseText: string; denomination: string };
    expect(input.denomination).toBe("Baptist");
    expect(input.verseText.length).toBeGreaterThan(0);
  });

  it("enforces 3 AI devotionals per rolling week on the free plan", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Free");
    for (let i = 0; i < 3; i++) {
      await caller.devotional.generate();
      h.clock.now = new Date(h.clock.now.getTime() + DAY);
    }
    expect((await caller.devotional.today()).quota.remaining).toBe(0);
    const err = await expectTrpcError(caller.devotional.generate(), "FORBIDDEN");
    expect(err.message).toMatch(/Grace Plus/);
    expect(h.writer.devotionalCalls).toBe(3);

    // A week after the first one, a slot opens again.
    h.clock.now = new Date(h.clock.now.getTime() + 5 * DAY);
    await caller.devotional.generate();
  });

  it("does not limit Plus subscribers", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Plus", { tier: "plus" });
    for (let i = 0; i < 5; i++) {
      await caller.devotional.generate();
      h.clock.now = new Date(h.clock.now.getTime() + DAY);
    }
    expect((await caller.devotional.today()).quota.limit).toBeNull();
  });

  it("surfaces AI failures without saving anything", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Err");
    h.writer.failWith = new AiError("declined", false);
    await expectTrpcError(caller.devotional.generate(), "PRECONDITION_FAILED");
    expect(h.writer.devotionalCalls).toBe(1); // non-retryable: no retry
    expect((await caller.devotional.today()).devotional).toBeNull();
    expect((await caller.devotional.today()).quota.used).toBe(0);
  });

  it("marks read, updates the streak, and toggles favorites", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Streak", { tier: "plus" });
    for (let i = 0; i < 3; i++) {
      const d = await caller.devotional.generate();
      const r = await caller.devotional.markRead({ id: d.id });
      expect(r.streakCount).toBe(i + 1);
      h.clock.now = new Date(h.clock.now.getTime() + DAY);
    }
    // Skip a day: the streak resets.
    h.clock.now = new Date(h.clock.now.getTime() + DAY);
    const d = await caller.devotional.generate();
    expect((await caller.devotional.markRead({ id: d.id })).streakCount).toBe(1);
    expect((await caller.auth.me())?.longestStreak).toBe(3);

    await caller.devotional.setFavorite({ id: d.id, isFavorite: true });
    expect((await caller.devotional.history({ favoritesOnly: true })).items.map((x) => x.id)).toEqual([d.id]);
  });

  it("limits free history to the last 7 days", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Hist", { tier: "plus" });
    for (let i = 0; i < 10; i++) {
      await caller.devotional.generate();
      h.clock.now = new Date(h.clock.now.getTime() + DAY);
    }
    expect((await caller.devotional.history({ limit: 50 })).items).toHaveLength(10);
    await h.deps.db.run("update users set subscription_tier = 'free'");
    const limited = await caller.devotional.history({ limit: 50 });
    expect(limited.limited).toBe(true);
    expect(limited.items.length).toBeLessThanOrEqual(7);
  });
});

describe("devotional helpers", () => {
  it("validates structure and length", () => {
    expect(validateDevotional(fakeDevotional()).insights).toHaveLength(3);
    expect(() => validateDevotional({ ...fakeDevotional(), insights: fakeDevotional().insights.slice(0, 2) })).toThrow(AiError);
    expect(() => validateDevotional({ ...fakeDevotional(), openingReflection: "short", insights: [], closingPrayer: "Amen" })).toThrow(AiError);
  });

  it("computes streaks across days", () => {
    expect(nextStreak(null, "2026-10-23", 0)).toBe(1);
    expect(nextStreak("2026-10-23", "2026-10-23", 4)).toBe(4);
    expect(nextStreak("2026-10-22", "2026-10-23", 4)).toBe(5);
    expect(nextStreak("2026-10-20", "2026-10-23", 4)).toBe(1);
    expect(nextStreak("2026-12-31", "2027-01-01", 9)).toBe(10);
  });

  it("chooses the daily verse deterministically", () => {
    expect(verseForDate("2026-10-23")).toEqual(verseForDate("2026-10-23"));
    expect(verseForDate("2026-10-23")).not.toEqual(verseForDate("2026-10-24"));
  });

  it("maps hours to prayer periods", () => {
    expect(periodForHour(6)).toBe("morning");
    expect(periodForHour(13)).toBe("afternoon");
    expect(periodForHour(22)).toBe("evening");
    expect(periodForHour(2)).toBe("evening");
  });
});

describe("prayer suggestions", () => {
  it("requires Plus, caches per period, and never sends prayer text to the model", async () => {
    const h = await createHarness();
    const free = await h.signUp("Free");
    await expectTrpcError(free.caller.prayers.suggestions(), "FORBIDDEN");

    const plus = await h.signUp("Plus", { tier: "plus" });
    await plus.caller.prayers.create({ content: "SECRET PRAYER TEXT", category: "petition" });
    const a = await plus.caller.prayers.suggestions();
    const b = await plus.caller.prayers.suggestions();
    expect(a.suggestions).toHaveLength(3);
    expect(b).toEqual(a);
    expect(h.writer.suggestionCalls).toBe(1);
    expect(JSON.stringify(h.writer.lastInput)).not.toContain("SECRET PRAYER TEXT");
  });
});
