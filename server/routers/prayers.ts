import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, PRAYER_CATEGORIES, PRAYER_SUGGESTION_TIER } from "../../shared/constants";
import { prayers, prayerSuggestions } from "../db/schema";
import { localDate, localHour } from "../lib/dates";
import { logger } from "../lib/logger";
import { AiError } from "../services/ai";
import { moderateText } from "../services/moderation";
import { protectedProcedure, rateLimit, requireTier, router } from "../trpc";

const category = z.enum(PRAYER_CATEGORIES);
const content = z.string().trim().min(1).max(LIMITS.prayerContent);

export function periodForHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

export const prayersRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          category: category.optional(),
          status: z.enum(["all", "open", "answered"]).default("all"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(prayers.userId, ctx.user.id)];
      if (input?.category) conditions.push(eq(prayers.category, input.category));
      if (input?.status === "open") conditions.push(eq(prayers.isAnswered, false));
      if (input?.status === "answered") conditions.push(eq(prayers.isAnswered, true));
      return ctx.db
        .select()
        .from(prayers)
        .where(and(...conditions))
        .orderBy(desc(prayers.createdAt), desc(prayers.id))
        .limit(500);
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const [{ total }] = await ctx.db.select({ total: count() }).from(prayers).where(eq(prayers.userId, ctx.user.id));
    const [{ answered }] = await ctx.db
      .select({ answered: count() })
      .from(prayers)
      .where(and(eq(prayers.userId, ctx.user.id), eq(prayers.isAnswered, true)));
    return { total, answered };
  }),

  create: protectedProcedure.input(z.object({ content, category })).mutation(async ({ ctx, input }) => {
    rateLimit(ctx, `prayer:${ctx.user.id}`, 60, 60 * 60 * 1000);
    const [row] = await ctx.db.insert(prayers).values({ userId: ctx.user.id, ...input }).returning();
    // Private journal text is never blocked, but we surface crisis resources when warranted.
    return { prayer: row, crisis: moderateText(input.content).crisis };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int(), content: content.optional(), category: category.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const rows = await ctx.db
        .update(prayers)
        .set(changes)
        .where(and(eq(prayers.id, id), eq(prayers.userId, ctx.user.id)))
        .returning();
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Prayer not found." });
      return rows[0];
    }),

  setAnswered: protectedProcedure
    .input(z.object({ id: z.number().int(), isAnswered: z.boolean(), answerNote: z.string().trim().max(LIMITS.prayerContent).optional() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .update(prayers)
        .set({
          isAnswered: input.isAnswered,
          answeredAt: input.isAnswered ? ctx.now() : null,
          answerNote: input.isAnswered ? (input.answerNote ?? null) : null,
        })
        .where(and(eq(prayers.id, input.id), eq(prayers.userId, ctx.user.id)))
        .returning();
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Prayer not found." });
      return rows[0];
    }),

  delete: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const rows = await ctx.db
      .delete(prayers)
      .where(and(eq(prayers.id, input.id), eq(prayers.userId, ctx.user.id)))
      .returning({ id: prayers.id });
    if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Prayer not found." });
    return { id: rows[0].id };
  }),

  /** AI prayer-topic ideas for this time of day. Cached per user/day/period. */
  suggestions: protectedProcedure.query(async ({ ctx }) => {
    requireTier(ctx.tier, PRAYER_SUGGESTION_TIER, "AI prayer suggestions");
    const now = ctx.now();
    const date = localDate(ctx.user.timezone, now);
    const period = periodForHour(localHour(ctx.user.timezone, now));
    const key = and(eq(prayerSuggestions.userId, ctx.user.id), eq(prayerSuggestions.date, date), eq(prayerSuggestions.period, period));
    const cached = await ctx.db.query.prayerSuggestions.findFirst({ where: key });
    if (cached) return { period, suggestions: cached.suggestions };

    rateLimit(ctx, `suggest:${ctx.user.id}`, 6, 60 * 60 * 1000);
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const recent = await ctx.db
      .select({ category: prayers.category, isAnswered: prayers.isAnswered })
      .from(prayers)
      .where(and(eq(prayers.userId, ctx.user.id), gte(prayers.createdAt, since)));
    const recentCategoryCounts = Object.fromEntries(PRAYER_CATEGORIES.map((c) => [c, recent.filter((r) => r.category === c).length]));

    try {
      const suggestions = await ctx.writer.suggestPrayerTopics({
        period,
        recentCategoryCounts,
        answeredRecently: recent.filter((r) => r.isAnswered).length,
      });
      await ctx.db.insert(prayerSuggestions).values({ userId: ctx.user.id, date, period, suggestions }).onConflictDoNothing();
      return { period, suggestions };
    } catch (err) {
      logger.error("prayers.suggestions_failed", { userId: ctx.user.id, error: err instanceof Error ? err.message : String(err) });
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: err instanceof AiError ? err.message : "Suggestions are unavailable right now.",
      });
    }
  }),
});
