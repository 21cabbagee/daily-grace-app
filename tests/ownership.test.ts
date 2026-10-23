import { describe, expect, it } from "vitest";
import { createHarness, expectTrpcError } from "./helpers";

describe("ownership isolation", () => {
  it("prayers are private to their owner", async () => {
    const h = await createHarness();
    const alice = await h.signUp("Alice");
    const bob = await h.signUp("Bob");
    const { prayer } = await alice.caller.prayers.create({ content: "For my mom", category: "intercession" });

    expect(await bob.caller.prayers.list()).toHaveLength(0);
    await expectTrpcError(bob.caller.prayers.update({ id: prayer.id, content: "hijacked" }), "NOT_FOUND");
    await expectTrpcError(bob.caller.prayers.setAnswered({ id: prayer.id, isAnswered: true }), "NOT_FOUND");
    await expectTrpcError(bob.caller.prayers.delete({ id: prayer.id }), "NOT_FOUND");

    const [mine] = await alice.caller.prayers.list();
    expect(mine.content).toBe("For my mom");
    expect(mine.isAnswered).toBe(false);
  });

  it("prayer CRUD, filtering, and answered state work for the owner", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Hannah");
    const a = (await caller.prayers.create({ content: "Praise you", category: "praise" })).prayer;
    await caller.prayers.create({ content: "Help me", category: "petition" });
    await caller.prayers.setAnswered({ id: a.id, isAnswered: true, answerNote: "He did" });

    expect(await caller.prayers.list({ status: "answered" })).toHaveLength(1);
    expect(await caller.prayers.list({ status: "open" })).toHaveLength(1);
    expect(await caller.prayers.list({ category: "petition", status: "all" })).toHaveLength(1);
    expect(await caller.prayers.stats()).toEqual({ total: 2, answered: 1 });

    const updated = await caller.prayers.update({ id: a.id, category: "thanksgiving" });
    expect(updated.category).toBe("thanksgiving");
    await caller.prayers.delete({ id: a.id });
    expect(await caller.prayers.list()).toHaveLength(1);
  });

  it("devotionals can't be read or changed by another user", async () => {
    const h = await createHarness();
    const alice = await h.signUp("Alice");
    const bob = await h.signUp("Bob");
    const d = await alice.caller.devotional.generate();
    await expectTrpcError(bob.caller.devotional.byId({ id: d.id }), "NOT_FOUND");
    await expectTrpcError(bob.caller.devotional.markRead({ id: d.id }), "NOT_FOUND");
    await expectTrpcError(bob.caller.devotional.setFavorite({ id: d.id, isFavorite: true }), "NOT_FOUND");
    expect((await bob.caller.devotional.history({})).items).toHaveLength(0);
  });

  it("bookmarks, highlights, and notes are scoped per user and unique per verse", async () => {
    const h = await createHarness();
    const alice = await h.signUp("Alice");
    const bob = await h.signUp("Bob");
    const ref = { bookId: "JHN", chapter: 3, verse: 16 };

    expect(await alice.caller.bible.toggleBookmark(ref)).toEqual({ bookmarked: true });
    await alice.caller.bible.setHighlight({ ...ref, color: "yellow" });
    await alice.caller.bible.setHighlight({ ...ref, color: "green" });
    await alice.caller.bible.saveNote({ ...ref, content: "For God so loved" });

    const mine = await alice.caller.bible.annotations({ bookId: "JHN", chapter: 3 });
    expect(mine.bookmarks).toEqual([16]);
    expect(mine.highlights[16]).toBe("green");
    expect(mine.notes[16]).toBe("For God so loved");

    const theirs = await bob.caller.bible.annotations({ bookId: "JHN", chapter: 3 });
    expect(theirs.bookmarks).toEqual([]);
    expect(theirs.highlights).toEqual({});

    expect(await alice.caller.bible.toggleBookmark(ref)).toEqual({ bookmarked: false });
    await alice.caller.bible.saveNote({ ...ref, content: "" });
    expect((await alice.caller.bible.annotations({ bookId: "JHN", chapter: 3 })).notes).toEqual({});
  });

  it("rejects unknown books", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Eve");
    await expectTrpcError(caller.bible.toggleBookmark({ bookId: "XYZ", chapter: 1, verse: 1 }), "BAD_REQUEST");
  });

  it("caps highlights for free users but not for Plus", async () => {
    const h = await createHarness();
    const free = await h.signUp("Free");
    const plus = await h.signUp("Plus", { tier: "plus" });
    for (let v = 1; v <= 25; v++) await free.caller.bible.setHighlight({ bookId: "PSA", chapter: 119, verse: v, color: "blue" });
    await expectTrpcError(free.caller.bible.setHighlight({ bookId: "PSA", chapter: 119, verse: 26, color: "blue" }), "FORBIDDEN");
    // Changing the colour of an existing highlight is still allowed.
    await free.caller.bible.setHighlight({ bookId: "PSA", chapter: 119, verse: 1, color: "pink" });
    for (let v = 1; v <= 26; v++) await plus.caller.bible.setHighlight({ bookId: "PSA", chapter: 119, verse: v, color: "blue" });
  });
});
