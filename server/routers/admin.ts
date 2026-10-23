import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { communityComments, communityPosts, reports } from "../db/schema";
import { protectedProcedure, router } from "../trpc";
import { setContentStatus } from "./community";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  return next();
});

export const adminRouter = router({
  /** Open reports with the reported content, newest first. */
  reportQueue: adminProcedure.query(async ({ ctx }) => {
    const open = await ctx.db.select().from(reports).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt)).limit(100);
    return Promise.all(
      open.map(async (r) => {
        const target =
          r.targetType === "post"
            ? await ctx.db.query.communityPosts.findFirst({ where: eq(communityPosts.id, r.targetId) })
            : await ctx.db.query.communityComments.findFirst({ where: eq(communityComments.id, r.targetId) });
        return {
          ...r,
          target: target ? { content: target.content, status: target.status, userId: target.userId, reportCount: target.reportCount } : null,
        };
      }),
    );
  }),

  /** remove: take content down; restore: make it visible again; dismiss: close the report only. */
  resolve: adminProcedure
    .input(z.object({ reportId: z.number().int(), action: z.enum(["remove", "restore", "dismiss"]) }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db.query.reports.findFirst({ where: eq(reports.id, input.reportId) });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      if (input.action !== "dismiss") {
        await setContentStatus(ctx.db, report.targetType, report.targetId, input.action === "remove" ? "removed" : "visible");
      }
      // Resolving one report resolves all open reports on the same content.
      await ctx.db
        .update(reports)
        .set({ status: input.action === "dismiss" ? "dismissed" : "actioned" })
        .where(and(eq(reports.targetType, report.targetType), eq(reports.targetId, report.targetId), eq(reports.status, "open")));
      return { ok: true };
    }),
});
