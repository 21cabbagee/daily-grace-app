import { TRPCError } from "@trpc/server";
import { eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { LIMITS } from "../../shared/constants";
import type { Db } from "../db/client";
import {
  blocks,
  bookmarks,
  communityComments,
  communityLikes,
  communityPosts,
  devotionals,
  highlights,
  prayers,
  prayerSuggestions,
  reports,
  subscriptionEvents,
  users,
  verseNotes,
} from "../db/schema";
import { isValidTimezone } from "../lib/dates";
import { DUMMY_HASH, hashPassword, signSession, verifyPassword } from "../services/auth";
import { protectedProcedure, publicProcedure, rateLimit, router } from "../trpc";
import { publicUser } from "./serialize";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`).max(128);


export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user, ctx.now()) : null)),

  signUp: publicProcedure
    .input(
      z.object({
        email,
        password,
        name: z.string().trim().min(1).max(LIMITS.name),
        timezone: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimit(ctx, `signup:${ctx.ip}`, 10, 60 * 60 * 1000);
      const existing = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
      const [user] = await ctx.db
        .insert(users)
        .values({
          email: input.email,
          passwordHash: await hashPassword(input.password),
          name: input.name,
          timezone: input.timezone && isValidTimezone(input.timezone) ? input.timezone : "America/New_York",
        })
        .returning();
      const token = await signSession({ userId: user.id, tokenVersion: user.tokenVersion }, ctx.jwtSecret);
      return { token, user: publicUser(user, ctx.now()) };
    }),

  signIn: publicProcedure.input(z.object({ email, password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
    rateLimit(ctx, `signin:ip:${ctx.ip}`, 30, 15 * 60 * 1000);
    rateLimit(ctx, `signin:email:${input.email}`, 10, 15 * 60 * 1000);
    const user = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) });
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect email or password." });
    const token = await signSession({ userId: user.id, tokenVersion: user.tokenVersion }, ctx.jwtSecret);
    return { token, user: publicUser(user, ctx.now()) };
  }),

  /** Revokes every session token for this account (the client also discards its own token). */
  signOutEverywhere: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),

  deleteAccount: protectedProcedure.input(z.object({ password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
    rateLimit(ctx, `delete:${ctx.user.id}`, 5, 15 * 60 * 1000);
    if (!(await verifyPassword(input.password, ctx.user.passwordHash))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
    }
    await deleteUserData(ctx.db, ctx.user.id);
    return { ok: true };
  }),
});

/** Permanently removes a user and everything they created. Counters on others' posts are recomputed. */
export async function deleteUserData(db: Db, userId: number) {
  await db.transaction(async (tx) => {
    const touched = new Set<number>();
    for (const r of await tx.select({ postId: communityLikes.postId }).from(communityLikes).where(eq(communityLikes.userId, userId))) touched.add(r.postId);
    for (const r of await tx.select({ postId: communityComments.postId }).from(communityComments).where(eq(communityComments.userId, userId))) touched.add(r.postId);

    const ownPosts = (await tx.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.userId, userId))).map((p) => p.id);
    if (ownPosts.length) {
      await tx.delete(communityLikes).where(inArray(communityLikes.postId, ownPosts));
      await tx.delete(communityComments).where(inArray(communityComments.postId, ownPosts));
      await tx.delete(communityPosts).where(inArray(communityPosts.id, ownPosts));
    }
    await tx.delete(communityLikes).where(eq(communityLikes.userId, userId));
    await tx.delete(communityComments).where(eq(communityComments.userId, userId));
    await tx.delete(reports).where(eq(reports.reporterId, userId));
    await tx.delete(blocks).where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
    await tx.delete(devotionals).where(eq(devotionals.userId, userId));
    await tx.delete(prayers).where(eq(prayers.userId, userId));
    await tx.delete(prayerSuggestions).where(eq(prayerSuggestions.userId, userId));
    await tx.delete(bookmarks).where(eq(bookmarks.userId, userId));
    await tx.delete(highlights).where(eq(highlights.userId, userId));
    await tx.delete(verseNotes).where(eq(verseNotes.userId, userId));
    await tx.update(subscriptionEvents).set({ userId: null }).where(eq(subscriptionEvents.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));

    for (const postId of touched) {
      if (ownPosts.includes(postId)) continue;
      await tx
        .update(communityPosts)
        .set({
          likeCount: sql`(select count(*) from ${communityLikes} where ${communityLikes.postId} = ${postId})`,
          commentCount: sql`(select count(*) from ${communityComments} where ${communityComments.postId} = ${postId} and ${communityComments.status} = 'visible')`,
        })
        .where(eq(communityPosts.id, postId));
    }
  });
}
