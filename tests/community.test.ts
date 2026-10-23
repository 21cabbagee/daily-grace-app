import { describe, expect, it } from "vitest";
import { moderateText } from "../server/services/moderation";
import { createHarness, expectTrpcError } from "./helpers";

describe("community", () => {
  it("only Pro members can post or comment; everyone signed in can read and like", async () => {
    const h = await createHarness();
    const free = await h.signUp("Free");
    const pro = await h.signUp("Pro", { tier: "pro" });
    await expectTrpcError(free.caller.community.createPost({ type: "verse_reaction", content: "hi" }), "FORBIDDEN");
    const { post } = await pro.caller.community.createPost({ type: "prayer_request", content: "Please pray for my exam" });
    await expectTrpcError(free.caller.community.addComment({ postId: post.id, content: "Praying" }), "FORBIDDEN");

    const feed = await free.caller.community.feed({});
    expect(feed.canPost).toBe(false);
    expect(feed.items[0].authorName).toBe("Pro");
    expect(await free.caller.community.toggleLike({ postId: post.id })).toEqual({ liked: true, likeCount: 1 });
    expect(await free.caller.community.toggleLike({ postId: post.id })).toEqual({ liked: false, likeCount: 0 });
  });

  it("requires sign-in to read the feed", async () => {
    const h = await createHarness();
    const anon = await h.callerFor(null);
    await expectTrpcError(anon.community.feed({}), "UNAUTHORIZED");
  });

  it("blocks offensive content and flags crisis language", async () => {
    const h = await createHarness();
    const pro = await h.signUp("Pro", { tier: "pro" });
    await expectTrpcError(pro.caller.community.createPost({ type: "verse_reaction", content: "this is sh1t" }), "BAD_REQUEST");
    const r = await pro.caller.community.createPost({ type: "prayer_request", content: "Some days I want to die. Please pray." });
    expect(r.crisis).toBe(true);
  });

  it("keeps comment counts accurate and lets only authors delete", async () => {
    const h = await createHarness();
    const a = await h.signUp("A", { tier: "pro" });
    const b = await h.signUp("B", { tier: "pro" });
    const { post } = await a.caller.community.createPost({ type: "verse_reaction", content: "John 1 is beautiful" });
    const { comment } = await b.caller.community.addComment({ postId: post.id, content: "Amen!" });
    expect((await a.caller.community.post({ postId: post.id })).post.commentCount).toBe(1);

    await expectTrpcError(a.caller.community.deleteComment({ commentId: comment.id }), "NOT_FOUND");
    await b.caller.community.deleteComment({ commentId: comment.id });
    expect((await a.caller.community.post({ postId: post.id })).post.commentCount).toBe(0);

    await expectTrpcError(b.caller.community.deletePost({ postId: post.id }), "NOT_FOUND");
    await a.caller.community.deletePost({ postId: post.id });
    expect((await b.caller.community.feed({})).items).toHaveLength(0);
  });

  it("hides content after enough distinct reports and lets admins resolve them", async () => {
    const h = await createHarness();
    const author = await h.signUp("Author", { tier: "pro" });
    const { post } = await author.caller.community.createPost({ type: "verse_reaction", content: "Buy my stuff" });
    await expectTrpcError(author.caller.community.report({ targetType: "post", targetId: post.id, reason: "spam" }), "BAD_REQUEST");

    const reporters = await Promise.all(["R1", "R2", "R3"].map((n) => h.signUp(n)));
    await reporters[0].caller.community.report({ targetType: "post", targetId: post.id, reason: "spam" });
    // Duplicate reports from the same person don't count twice.
    await reporters[0].caller.community.report({ targetType: "post", targetId: post.id, reason: "spam" });
    await reporters[1].caller.community.report({ targetType: "post", targetId: post.id, reason: "spam" });
    expect((await reporters[2].caller.community.feed({})).items).toHaveLength(1);
    await reporters[2].caller.community.report({ targetType: "post", targetId: post.id, reason: "spam" });
    expect((await reporters[2].caller.community.feed({})).items).toHaveLength(0);

    await expectTrpcError(reporters[0].caller.admin.reportQueue(), "FORBIDDEN");
    const admin = await h.signUp("Admin", { role: "admin" });
    const queue = await admin.caller.admin.reportQueue();
    expect(queue).toHaveLength(3);
    await admin.caller.admin.resolve({ reportId: queue[0].id, action: "restore" });
    expect(await admin.caller.admin.reportQueue()).toHaveLength(0);
    expect((await reporters[0].caller.community.feed({})).items).toHaveLength(1);
  });

  it("blocking hides content in both directions", async () => {
    const h = await createHarness();
    const a = await h.signUp("A", { tier: "pro" });
    const b = await h.signUp("B", { tier: "pro" });
    const { post } = await b.caller.community.createPost({ type: "verse_reaction", content: "Hello from B" });
    await a.caller.community.createPost({ type: "verse_reaction", content: "Hello from A" });
    await a.caller.community.block({ userId: b.id });

    expect((await a.caller.community.feed({})).items.map((p) => p.authorName)).toEqual(["A"]);
    expect((await b.caller.community.feed({})).items.map((p) => p.authorName)).toEqual(["B"]);
    await expectTrpcError(a.caller.community.comments({ postId: post.id }), "NOT_FOUND");
    expect(await a.caller.community.blockedUsers()).toEqual([{ userId: b.id, name: "B" }]);

    await a.caller.community.unblock({ userId: b.id });
    expect((await a.caller.community.feed({})).items).toHaveLength(2);
  });

  it("paginates the feed", async () => {
    const h = await createHarness();
    const pro = await h.signUp("Pro", { tier: "pro" });
    for (let i = 0; i < 5; i++) {
      await pro.caller.community.createPost({ type: "verse_reaction", content: `post ${i}` });
      h.clock.now = new Date(h.clock.now.getTime() + 13 * 60 * 1000); // stay under the hourly post limit
    }
    const page1 = await pro.caller.community.feed({ limit: 3 });
    expect(page1.items).toHaveLength(3);
    const page2 = await pro.caller.community.feed({ limit: 3, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
  });
});

describe("moderation rules", () => {
  it("allows ordinary faith language", () => {
    expect(moderateText("I want to end my day with prayer and thank God").allowed).toBe(true);
    expect(moderateText("I want to end my day with prayer and thank God").crisis).toBe(false);
    expect(moderateText("Pastor Dick preached on grace").allowed).toBe(true);
  });

  it("rejects link spam and repeated characters", () => {
    expect(moderateText("see https://a.com and https://b.com").allowed).toBe(false);
    expect(moderateText("aaaaaaaaaaaaaaa").allowed).toBe(false);
    expect(moderateText("Read https://biblegateway.com").allowed).toBe(true);
  });
});
