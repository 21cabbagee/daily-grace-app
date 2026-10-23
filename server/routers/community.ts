import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AUTO_HIDE_REPORT_THRESHOLD, COMMUNITY_POST_TIER, hasTier, LIMITS, POST_TYPES, REPORT_REASONS } from "../../shared/constants";
import type { Db } from "../db/client";
import { blocks, communityComments, communityLikes, communityPosts, reports, users } from "../db/schema";
import { moderateText } from "../services/moderation";
import { protectedProcedure, rateLimit, requireTier, router, type Context } from "../trpc";

/** Users hidden from `userId` in either direction. */
async function blockedUserIds(db: Db, userId: number): Promise<number[]> {
  const rows = await db
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
}

function screen(text: string) {
  const result = moderateText(text);
  if (!result.allowed) throw new TRPCError({ code: "BAD_REQUEST", message: result.reason ?? "This content isn't allowed." });
  return result;
}

async function loadVisiblePost(ctx: Context & { user: { id: number } }, postId: number) {
  const post = await ctx.db.query.communityPosts.findFirst({ where: eq(communityPosts.id, postId) });
  if (!post || post.status !== "visible") throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
  const hidden = await blockedUserIds(ctx.db, ctx.user.id);
  if (hidden.includes(post.userId)) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
  return post;
}

export const communityRouter = router({
  feed: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.number().int().optional(),
        type: z.enum(POST_TYPES).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const hidden = await blockedUserIds(ctx.db, ctx.user.id);
      const conditions = [eq(communityPosts.status, "visible")];
      if (hidden.length) conditions.push(notInArray(communityPosts.userId, hidden));
      if (input.cursor) conditions.push(lt(communityPosts.id, input.cursor));
      if (input.type) conditions.push(eq(communityPosts.type, input.type));

      const rows = await ctx.db
        .select({ post: communityPosts, authorName: users.name })
        .from(communityPosts)
        .innerJoin(users, eq(users.id, communityPosts.userId))
        .where(and(...conditions))
        .orderBy(desc(communityPosts.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const ids = page.map((r) => r.post.id);
      const liked = ids.length
        ? new Set(
            (
              await ctx.db
                .select({ postId: communityLikes.postId })
                .from(communityLikes)
                .where(and(eq(communityLikes.userId, ctx.user.id), inArray(communityLikes.postId, ids)))
            ).map((r) => r.postId),
          )
        : new Set<number>();

      return {
        items: page.map(({ post, authorName }) => ({
          id: post.id,
          type: post.type,
          content: post.content,
          reference: post.reference,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          createdAt: post.createdAt,
          authorId: post.userId,
          authorName,
          likedByMe: liked.has(post.id),
          isMine: post.userId === ctx.user.id,
        })),
        nextCursor: rows.length > input.limit ? page[page.length - 1].post.id : null,
        canPost: hasTier(ctx.tier, COMMUNITY_POST_TIER),
      };
    }),

  post: protectedProcedure.input(z.object({ postId: z.number().int() })).query(async ({ ctx, input }) => {
    const post = await loadVisiblePost(ctx, input.postId);
    const author = await ctx.db.query.users.findFirst({ where: eq(users.id, post.userId), columns: { name: true } });
    const liked = await ctx.db.query.communityLikes.findFirst({
      where: and(eq(communityLikes.userId, ctx.user.id), eq(communityLikes.postId, post.id)),
    });
    return {
      post: {
        id: post.id,
        type: post.type,
        content: post.content,
        reference: post.reference,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        createdAt: post.createdAt,
        authorId: post.userId,
        authorName: author?.name ?? "Member",
        likedByMe: !!liked,
        isMine: post.userId === ctx.user.id,
      },
      canPost: hasTier(ctx.tier, COMMUNITY_POST_TIER),
    };
  }),

  createPost: protectedProcedure
    .input(
      z.object({
        type: z.enum(POST_TYPES),
        content: z.string().trim().min(1).max(LIMITS.postContent),
        reference: z.string().trim().max(60).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.tier, COMMUNITY_POST_TIER, "Posting in the community");
      rateLimit(ctx, `post:${ctx.user.id}`, 5, 60 * 60 * 1000);
      const { crisis } = screen(input.content);
      const [post] = await ctx.db
        .insert(communityPosts)
        .values({ userId: ctx.user.id, type: input.type, content: input.content, reference: input.reference || null })
        .returning();
      return { post, crisis };
    }),

  deletePost: protectedProcedure.input(z.object({ postId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const post = await ctx.db.query.communityPosts.findFirst({ where: eq(communityPosts.id, input.postId) });
    if (!post || (post.userId !== ctx.user.id && ctx.user.role !== "admin")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
    }
    await ctx.db.transaction(async (tx) => {
      await tx.delete(communityLikes).where(eq(communityLikes.postId, post.id));
      await tx.delete(communityComments).where(eq(communityComments.postId, post.id));
      await tx.delete(reports).where(and(eq(reports.targetType, "post"), eq(reports.targetId, post.id)));
      await tx.delete(communityPosts).where(eq(communityPosts.id, post.id));
    });
    return { id: post.id };
  }),

  toggleLike: protectedProcedure.input(z.object({ postId: z.number().int() })).mutation(async ({ ctx, input }) => {
    rateLimit(ctx, `like:${ctx.user.id}`, 120, 60 * 1000);
    const post = await loadVisiblePost(ctx, input.postId);
    return ctx.db.transaction(async (tx) => {
      const removed = await tx
        .delete(communityLikes)
        .where(and(eq(communityLikes.userId, ctx.user.id), eq(communityLikes.postId, post.id)))
        .returning({ id: communityLikes.id });
      if (!removed.length) await tx.insert(communityLikes).values({ userId: ctx.user.id, postId: post.id }).onConflictDoNothing();
      const [updated] = await tx
        .update(communityPosts)
        .set({ likeCount: sql`(select count(*) from ${communityLikes} where ${communityLikes.postId} = ${post.id})` })
        .where(eq(communityPosts.id, post.id))
        .returning({ likeCount: communityPosts.likeCount });
      return { liked: removed.length === 0, likeCount: updated.likeCount };
    });
  }),

  comments: protectedProcedure.input(z.object({ postId: z.number().int() })).query(async ({ ctx, input }) => {
    await loadVisiblePost(ctx, input.postId);
    const hidden = await blockedUserIds(ctx.db, ctx.user.id);
    const conditions = [eq(communityComments.postId, input.postId), eq(communityComments.status, "visible")];
    if (hidden.length) conditions.push(notInArray(communityComments.userId, hidden));
    const rows = await ctx.db
      .select({ c: communityComments, authorName: users.name })
      .from(communityComments)
      .innerJoin(users, eq(users.id, communityComments.userId))
      .where(and(...conditions))
      .orderBy(asc(communityComments.createdAt))
      .limit(200);
    return rows.map(({ c, authorName }) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      authorId: c.userId,
      authorName,
      isMine: c.userId === ctx.user.id,
    }));
  }),

  addComment: protectedProcedure
    .input(z.object({ postId: z.number().int(), content: z.string().trim().min(1).max(LIMITS.commentContent) }))
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.tier, COMMUNITY_POST_TIER, "Commenting in the community");
      rateLimit(ctx, `comment:${ctx.user.id}`, 20, 60 * 60 * 1000);
      const post = await loadVisiblePost(ctx, input.postId);
      const { crisis } = screen(input.content);
      const comment = await ctx.db.transaction(async (tx) => {
        const [row] = await tx.insert(communityComments).values({ postId: post.id, userId: ctx.user.id, content: input.content }).returning();
        await tx
          .update(communityPosts)
          .set({ commentCount: sql`${communityPosts.commentCount} + 1` })
          .where(eq(communityPosts.id, post.id));
        return row;
      });
      return { comment, crisis };
    }),

  deleteComment: protectedProcedure.input(z.object({ commentId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const comment = await ctx.db.query.communityComments.findFirst({ where: eq(communityComments.id, input.commentId) });
    if (!comment || (comment.userId !== ctx.user.id && ctx.user.role !== "admin")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found." });
    }
    await ctx.db.transaction(async (tx) => {
      await tx.delete(communityComments).where(eq(communityComments.id, comment.id));
      await tx.delete(reports).where(and(eq(reports.targetType, "comment"), eq(reports.targetId, comment.id)));
      if (comment.status === "visible") {
        await tx
          .update(communityPosts)
          .set({ commentCount: sql`max(${communityPosts.commentCount} - 1, 0)` })
          .where(eq(communityPosts.id, comment.postId));
      }
    });
    return { id: comment.id };
  }),

  report: protectedProcedure
    .input(
      z.object({
        targetType: z.enum(["post", "comment"]),
        targetId: z.number().int(),
        reason: z.enum(REPORT_REASONS),
        details: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimit(ctx, `report:${ctx.user.id}`, 30, 60 * 60 * 1000);
      const table = input.targetType === "post" ? communityPosts : communityComments;
      const target = await ctx.db.select({ id: table.id, userId: table.userId }).from(table).where(eq(table.id, input.targetId)).get();
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Content not found." });
      if (target.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't report your own content." });

      const inserted = await ctx.db
        .insert(reports)
        .values({ reporterId: ctx.user.id, ...input, details: input.details || null })
        .onConflictDoNothing()
        .returning({ id: reports.id });
      if (inserted.length) {
        const [row] = await ctx.db
          .update(table)
          .set({ reportCount: sql`${table.reportCount} + 1` })
          .where(eq(table.id, input.targetId))
          .returning({ reportCount: table.reportCount, status: table.status });
        // Enough independent reports hide the content until a moderator reviews it.
        if (row.reportCount >= AUTO_HIDE_REPORT_THRESHOLD && row.status === "visible") {
          await setContentStatus(ctx.db, input.targetType, input.targetId, "hidden");
        }
      }
      return { ok: true };
    }),

  block: protectedProcedure.input(z.object({ userId: z.number().int() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't block yourself." });
    await ctx.db.insert(blocks).values({ blockerId: ctx.user.id, blockedId: input.userId }).onConflictDoNothing();
    return { ok: true };
  }),

  unblock: protectedProcedure.input(z.object({ userId: z.number().int() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(blocks).where(and(eq(blocks.blockerId, ctx.user.id), eq(blocks.blockedId, input.userId)));
    return { ok: true };
  }),

  blockedUsers: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ userId: blocks.blockedId, name: users.name })
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(eq(blocks.blockerId, ctx.user.id));
  }),
});

/** Changes moderation status and keeps the parent post's visible-comment count consistent. */
export async function setContentStatus(db: Db, targetType: "post" | "comment", targetId: number, status: "visible" | "hidden" | "removed") {
  if (targetType === "post") {
    await db.update(communityPosts).set({ status }).where(eq(communityPosts.id, targetId));
    return;
  }
  const comment = await db.query.communityComments.findFirst({ where: eq(communityComments.id, targetId) });
  if (!comment || comment.status === status) return;
  await db.update(communityComments).set({ status }).where(eq(communityComments.id, targetId));
  await db
    .update(communityPosts)
    .set({
      commentCount: sql`(select count(*) from ${communityComments} where ${communityComments.postId} = ${comment.postId} and ${communityComments.status} = 'visible')`,
    })
    .where(eq(communityPosts.id, comment.postId));
}
