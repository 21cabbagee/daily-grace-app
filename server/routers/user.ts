import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DENOMINATIONS, LIMITS } from "../../shared/constants";
import { users } from "../db/schema";
import { isValidTimezone } from "../lib/dates";
import { protectedProcedure, router } from "../trpc";
import { getDevotionalQuota } from "./devotional";
import { publicUser } from "./serialize";

export const userRouter = router({
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(LIMITS.name).optional(),
        denomination: z.enum(DENOMINATIONS).optional(),
        timezone: z.string().max(64).optional(),
        onboardingCompleted: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.timezone && !isValidTimezone(input.timezone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown timezone." });
      }
      const [user] = await ctx.db.update(users).set(input).where(eq(users.id, ctx.user.id)).returning();
      return publicUser(user, ctx.now());
    }),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        remindersEnabled: z.boolean().optional(),
        reminderHour: z.number().int().min(0).max(23).optional(),
        reminderMinute: z.number().int().min(0).max(59).optional(),
        communityNotifications: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.update(users).set(input).where(eq(users.id, ctx.user.id)).returning();
      return publicUser(user, ctx.now());
    }),

  usage: protectedProcedure.query(async ({ ctx }) => {
    return { tier: ctx.tier, devotionals: await getDevotionalQuota(ctx.db, ctx.user.id, ctx.tier, ctx.now()) };
  }),
});
