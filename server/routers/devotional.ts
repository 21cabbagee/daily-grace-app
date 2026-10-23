import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { verseForDate } from "../../shared/daily-verses";
import { FREE_WEEKLY_DEVOTIONALS, hasTier, LIMITS, type SubscriptionTier } from "../../shared/constants";
import type { Db } from "../db/client";
import { devotionals, users } from "../db/schema";
import { daysBetween, localDate } from "../lib/dates";
import { logger } from "../lib/logger";
import { AiError } from "../services/ai";
import { withRetry } from "../services/scripture";
import { protectedProcedure, publicProcedure, rateLimit, router } from "../trpc";
import { scriptureCall } from "./bible";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export interface DevotionalQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
}

/** Free users get FREE_WEEKLY_DEVOTIONALS AI devotionals per rolling 7 days; paid plans are unlimited. */
export async function getDevotionalQuota(db: Db, userId: number, tier: SubscriptionTier, now: Date): Promise<DevotionalQuota> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(devotionals)
    .where(and(eq(devotionals.userId, userId), eq(devotionals.isAiGenerated, true), gte(devotionals.createdAt, since)));
  if (hasTier(tier, "plus")) return { limit: null, used: n, remaining: null };
  return { limit: FREE_WEEKLY_DEVOTIONALS, used: n, remaining: Math.max(0, FREE_WEEKLY_DEVOTIONALS - n) };
}

/** Streak counts consecutive local days on which the user finished a devotional. */
export function nextStreak(lastDate: string | null, today: string, current: number): number {
  if (!lastDate) return 1;
  const gap = daysBetween(lastDate, today);
  if (gap <= 0) return Math.max(current, 1);
  if (gap === 1) return current + 1;
  return 1;
}

export const devotionalRouter = router({
  /** Today's shared verse. Public so the signed-out home screen can show it. */
  dailyVerse: publicProcedure.input(z.object({ date: isoDate.optional() }).optional()).query(async ({ ctx, input }) => {
    const date = input?.date ?? (ctx.user ? localDate(ctx.user.timezone, ctx.now()) : localDate("America/New_York", ctx.now()));
    const passage = await scriptureCall(() => ctx.scripture.getPassage(verseForDate(date)));
    return { date, ...passage };
  }),

  today: protectedProcedure.query(async ({ ctx }) => {
    const date = localDate(ctx.user.timezone, ctx.now());
    const devotional = await ctx.db.query.devotionals.findFirst({
      where: and(eq(devotionals.userId, ctx.user.id), eq(devotionals.date, date)),
    });
    const quota = await getDevotionalQuota(ctx.db, ctx.user.id, ctx.tier, ctx.now());
    return { date, reference: verseForDate(date), devotional: devotional ?? null, quota };
  }),

  /**
   * Returns today's devotional, generating it on first open. Generation is idempotent per
   * user/day and enforces the plan quota server-side.
   */
  generate: protectedProcedure
    .input(z.object({ situation: z.string().trim().max(LIMITS.situation).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const date = localDate(ctx.user.timezone, ctx.now());
      const where = and(eq(devotionals.userId, ctx.user.id), eq(devotionals.date, date));
      const existing = await ctx.db.query.devotionals.findFirst({ where });
      if (existing) return existing;

      const quota = await getDevotionalQuota(ctx.db, ctx.user.id, ctx.tier, ctx.now());
      if (quota.remaining === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You've used your ${FREE_WEEKLY_DEVOTIONALS} free devotionals this week. Upgrade to Grace Plus for unlimited devotionals.`,
          cause: { upgradeRequired: "plus" },
        });
      }
      rateLimit(ctx, `generate:${ctx.user.id}`, 5, 10 * 60 * 1000);

      const passage = await scriptureCall(() => ctx.scripture.getPassage(verseForDate(date)));
      let content;
      try {
        content = await withRetry(
          () =>
            ctx.writer.writeDevotional({
              reference: passage.reference,
              verseText: passage.text,
              denomination: ctx.user.denomination,
              situation: input?.situation,
            }),
          { attempts: 2, baseDelayMs: 1000, shouldRetry: (err) => !(err instanceof AiError) || err.retryable },
        );
      } catch (err) {
        logger.error("devotional.generate_failed", { userId: ctx.user.id, error: err instanceof Error ? err.message : String(err) });
        throw new TRPCError({
          code: err instanceof AiError && !err.retryable ? "PRECONDITION_FAILED" : "SERVICE_UNAVAILABLE",
          message: err instanceof AiError ? err.message : "We couldn't prepare today's devotional. Please try again.",
        });
      }

      await ctx.db
        .insert(devotionals)
        .values({
          userId: ctx.user.id,
          date,
          reference: passage.reference,
          verseText: passage.text,
          ...content,
          isAiGenerated: true,
          model: ctx.writer.model,
        })
        .onConflictDoNothing();
      const saved = await ctx.db.query.devotionals.findFirst({ where });
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Devotional was not saved" });
      return saved;
    }),

  byId: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const row = await ctx.db.query.devotionals.findFirst({
      where: and(eq(devotionals.id, input.id), eq(devotionals.userId, ctx.user.id)),
    });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Devotional not found." });
    return row;
  }),

  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.number().int().optional(),
        favoritesOnly: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Devotional history is a Plus feature; free users can still see the last 7 days.
      const conditions = [eq(devotionals.userId, ctx.user.id)];
      if (input.cursor) conditions.push(lt(devotionals.id, input.cursor));
      if (input.favoritesOnly) conditions.push(eq(devotionals.isFavorite, true));
      if (!hasTier(ctx.tier, "plus")) {
        conditions.push(gte(devotionals.date, localDate(ctx.user.timezone, new Date(ctx.now().getTime() - 6 * 86_400_000))));
      }
      const rows = await ctx.db
        .select()
        .from(devotionals)
        .where(and(...conditions))
        .orderBy(desc(devotionals.id))
        .limit(input.limit + 1);
      const hasMore = rows.length > input.limit;
      const items = rows.slice(0, input.limit);
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null, limited: !hasTier(ctx.tier, "plus") };
    }),

  markRead: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const row = await ctx.db.query.devotionals.findFirst({
      where: and(eq(devotionals.id, input.id), eq(devotionals.userId, ctx.user.id)),
    });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Devotional not found." });
    if (!row.readAt) {
      await ctx.db.update(devotionals).set({ readAt: ctx.now() }).where(eq(devotionals.id, row.id));
    }
    const today = localDate(ctx.user.timezone, ctx.now());
    const streak = nextStreak(ctx.user.lastDevotionDate, today, ctx.user.streakCount);
    const [user] = await ctx.db
      .update(users)
      .set({ streakCount: streak, longestStreak: Math.max(ctx.user.longestStreak, streak), lastDevotionDate: today })
      .where(eq(users.id, ctx.user.id))
      .returning();
    return { streakCount: user.streakCount, longestStreak: user.longestStreak };
  }),

  setFavorite: protectedProcedure
    .input(z.object({ id: z.number().int(), isFavorite: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(devotionals)
        .set({ isFavorite: input.isFavorite })
        .where(and(eq(devotionals.id, input.id), eq(devotionals.userId, ctx.user.id)))
        .returning({ id: devotionals.id, isFavorite: devotionals.isFavorite });
      if (updated.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Devotional not found." });
      return updated[0];
    }),
});
