import { TRPCError } from "@trpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { formatReference, getBook } from "../../shared/bible";
import { FREE_ANNOTATION_LIMIT, hasTier, HIGHLIGHT_COLORS, LIMITS } from "../../shared/constants";
import { bookmarks, highlights, verseNotes } from "../db/schema";
import { logger } from "../lib/logger";
import { ScriptureError } from "../services/scripture";
import { protectedProcedure, publicProcedure, rateLimit, router } from "../trpc";

const bookId = z.string().refine((id) => !!getBook(id), "Unknown book");
const chapterRef = z.object({ bookId, chapter: z.number().int().min(1).max(150) });
const verseRef = chapterRef.extend({ verse: z.number().int().min(1).max(200) });

export async function scriptureCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ScriptureError && /Unknown|not found/i.test(err.message)) {
      throw new TRPCError({ code: "NOT_FOUND", message: err.message });
    }
    logger.error("scripture.fetch_failed", { error: err instanceof Error ? err.message : String(err) });
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Scripture is temporarily unavailable. Please try again." });
  }
}

export const bibleRouter = router({
  chapter: publicProcedure.input(chapterRef).query(async ({ ctx, input }) => {
    rateLimit(ctx, `chapter:${ctx.user?.id ?? ctx.ip}`, 120, 60 * 1000);
    return scriptureCall(() => ctx.scripture.getChapter(input.bookId, input.chapter));
  }),

  annotations: protectedProcedure.input(chapterRef).query(async ({ ctx, input }) => {
    const byChapter = <T extends typeof bookmarks | typeof highlights | typeof verseNotes>(t: T) =>
      and(eq(t.userId, ctx.user.id), eq(t.bookId, input.bookId), eq(t.chapter, input.chapter));
    const [b, h, n] = await Promise.all([
      ctx.db.select().from(bookmarks).where(byChapter(bookmarks)),
      ctx.db.select().from(highlights).where(byChapter(highlights)),
      ctx.db.select().from(verseNotes).where(byChapter(verseNotes)),
    ]);
    return {
      bookmarks: b.map((r) => r.verse),
      highlights: Object.fromEntries(h.map((r) => [r.verse, r.color])) as Record<number, (typeof HIGHLIGHT_COLORS)[number]>,
      notes: Object.fromEntries(n.map((r) => [r.verse, r.content])) as Record<number, string>,
    };
  }),

  toggleBookmark: protectedProcedure.input(verseRef).mutation(async ({ ctx, input }) => {
    const where = and(
      eq(bookmarks.userId, ctx.user.id),
      eq(bookmarks.bookId, input.bookId),
      eq(bookmarks.chapter, input.chapter),
      eq(bookmarks.verse, input.verse),
    );
    const removed = await ctx.db.delete(bookmarks).where(where).returning({ id: bookmarks.id });
    if (removed.length) return { bookmarked: false };
    await ctx.db.insert(bookmarks).values({ userId: ctx.user.id, ...input }).onConflictDoNothing();
    return { bookmarked: true };
  }),

  setHighlight: protectedProcedure
    .input(verseRef.extend({ color: z.enum(HIGHLIGHT_COLORS).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { color, ...ref } = input;
      const where = and(
        eq(highlights.userId, ctx.user.id),
        eq(highlights.bookId, ref.bookId),
        eq(highlights.chapter, ref.chapter),
        eq(highlights.verse, ref.verse),
      );
      if (color === null) {
        await ctx.db.delete(highlights).where(where);
        return { color: null };
      }
      const existing = await ctx.db.query.highlights.findFirst({ where });
      if (!existing && !hasTier(ctx.tier, "plus")) {
        const [{ n }] = await ctx.db.select({ n: count() }).from(highlights).where(eq(highlights.userId, ctx.user.id));
        if (n >= FREE_ANNOTATION_LIMIT) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Free accounts can keep ${FREE_ANNOTATION_LIMIT} highlights. Upgrade to Grace Plus for unlimited highlights.`,
            cause: { upgradeRequired: "plus" },
          });
        }
      }
      await ctx.db
        .insert(highlights)
        .values({ userId: ctx.user.id, ...ref, color })
        .onConflictDoUpdate({ target: [highlights.userId, highlights.bookId, highlights.chapter, highlights.verse], set: { color } });
      return { color };
    }),

  saveNote: protectedProcedure
    .input(verseRef.extend({ content: z.string().trim().max(LIMITS.noteContent) }))
    .mutation(async ({ ctx, input }) => {
      const { content, ...ref } = input;
      const where = and(
        eq(verseNotes.userId, ctx.user.id),
        eq(verseNotes.bookId, ref.bookId),
        eq(verseNotes.chapter, ref.chapter),
        eq(verseNotes.verse, ref.verse),
      );
      if (!content) {
        await ctx.db.delete(verseNotes).where(where);
        return { content: null };
      }
      const existing = await ctx.db.query.verseNotes.findFirst({ where });
      if (!existing && !hasTier(ctx.tier, "plus")) {
        const [{ n }] = await ctx.db.select({ n: count() }).from(verseNotes).where(eq(verseNotes.userId, ctx.user.id));
        if (n >= FREE_ANNOTATION_LIMIT) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Free accounts can keep ${FREE_ANNOTATION_LIMIT} notes. Upgrade to Grace Plus for unlimited notes.`,
            cause: { upgradeRequired: "plus" },
          });
        }
      }
      await ctx.db
        .insert(verseNotes)
        .values({ userId: ctx.user.id, ...ref, content })
        .onConflictDoUpdate({ target: [verseNotes.userId, verseNotes.bookId, verseNotes.chapter, verseNotes.verse], set: { content } });
      return { content };
    }),

  bookmarks: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(bookmarks).where(eq(bookmarks.userId, ctx.user.id)).orderBy(desc(bookmarks.createdAt)).limit(500);
    return rows.map((r) => ({
      ...r,
      reference: formatReference({ bookId: r.bookId, chapter: r.chapter, verseStart: r.verse, verseEnd: r.verse }),
    }));
  }),
});
