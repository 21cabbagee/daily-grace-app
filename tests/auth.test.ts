import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { communityPosts, prayers, users } from "../server/db/schema";
import { createHarness, expectTrpcError } from "./helpers";

describe("auth", () => {
  it("signs up, returns a public profile without secrets, and resolves me", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Grace");
    const me = await caller.auth.me();
    expect(me?.name).toBe("Grace");
    expect(me?.tier).toBe("free");
    expect(me).not.toHaveProperty("passwordHash");
    expect(me).not.toHaveProperty("tokenVersion");
  });

  it("rejects duplicate emails and wrong passwords", async () => {
    const h = await createHarness();
    const anon = await h.callerFor(null);
    await anon.auth.signUp({ name: "A", email: "Same@Example.com", password: "password123" });
    await expectTrpcError(anon.auth.signUp({ name: "B", email: "same@example.com", password: "password123" }), "CONFLICT");
    await expectTrpcError(anon.auth.signIn({ email: "same@example.com", password: "nope-nope" }), "UNAUTHORIZED");
    await expectTrpcError(anon.auth.signIn({ email: "nobody@example.com", password: "nope-nope" }), "UNAUTHORIZED");
    const ok = await anon.auth.signIn({ email: "SAME@example.com", password: "password123" });
    expect(ok.token).toBeTruthy();
  });

  it("enforces a minimum password length", async () => {
    const h = await createHarness();
    const anon = await h.callerFor(null);
    await expectTrpcError(anon.auth.signUp({ name: "A", email: "a@example.com", password: "short" }), "BAD_REQUEST");
  });

  it("treats garbage or forged tokens as signed out", async () => {
    const h = await createHarness();
    const caller = await h.callerFor("not-a-jwt");
    expect(await caller.auth.me()).toBeNull();
    await expectTrpcError(caller.prayers.list(), "UNAUTHORIZED");
  });

  it("revokes all sessions on signOutEverywhere", async () => {
    const h = await createHarness();
    const { caller, token } = await h.signUp("Ruth");
    await caller.auth.signOutEverywhere();
    const stale = await h.callerFor(token);
    expect(await stale.auth.me()).toBeNull();
  });

  it("rate-limits repeated failed sign-ins for one email", async () => {
    const h = await createHarness();
    const anon = await h.callerFor(null);
    await anon.auth.signUp({ name: "A", email: "rl@example.com", password: "password123" });
    for (let i = 0; i < 10; i++) {
      await expectTrpcError(anon.auth.signIn({ email: "rl@example.com", password: "wrong-password" }), "UNAUTHORIZED");
    }
    await expectTrpcError(anon.auth.signIn({ email: "rl@example.com", password: "password123" }), "TOO_MANY_REQUESTS");
  });

  it("deletes the account and all owned data, requiring the password", async () => {
    const h = await createHarness();
    const alice = await h.signUp("Alice", { tier: "pro" });
    const bob = await h.signUp("Bob", { tier: "pro" });
    await alice.caller.prayers.create({ content: "Private", category: "petition" });
    const { post } = await bob.caller.community.createPost({ type: "verse_reaction", content: "Hello" });
    await alice.caller.community.toggleLike({ postId: post.id });
    await alice.caller.community.addComment({ postId: post.id, content: "Amen" });

    await expectTrpcError(alice.caller.auth.deleteAccount({ password: "wrong" }), "UNAUTHORIZED");
    await alice.caller.auth.deleteAccount({ password: "correct horse battery" });

    expect(await h.db.query.users.findFirst({ where: eq(users.id, alice.id) })).toBeUndefined();
    expect(await h.db.select().from(prayers).where(eq(prayers.userId, alice.id))).toHaveLength(0);
    const after = await h.db.query.communityPosts.findFirst({ where: eq(communityPosts.id, post.id) });
    expect(after?.likeCount).toBe(0);
    expect(after?.commentCount).toBe(0);
    const stale = await h.callerFor(alice.token);
    expect(await stale.auth.me()).toBeNull();
  });
});
