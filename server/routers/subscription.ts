import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { PLANS } from "../../shared/constants";
import { users } from "../db/schema";
import { logger } from "../lib/logger";
import { applyEntitlement, effectiveTier, fetchRevenueCatEntitlement } from "../services/billing";
import { protectedProcedure, rateLimit, router } from "../trpc";

export const subscriptionRouter = router({
  status: protectedProcedure.query(({ ctx }) => ({
    tier: ctx.tier,
    expiresAt: ctx.user.subscriptionExpiresAt,
    plans: PLANS,
    // RevenueCat app user id the client must log in with, so webhooks map back to this account.
    appUserId: String(ctx.user.id),
  })),

  /**
   * Re-reads entitlements from RevenueCat's REST API after a purchase or restore.
   * The client never tells us its tier; we ask RevenueCat directly.
   */
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    rateLimit(ctx, `sub-refresh:${ctx.user.id}`, 10, 10 * 60 * 1000);
    if (!ctx.revenueCatSecretKey) {
      return { tier: ctx.tier, expiresAt: ctx.user.subscriptionExpiresAt, synced: false };
    }
    try {
      const ent = await fetchRevenueCatEntitlement(String(ctx.user.id), ctx.revenueCatSecretKey);
      await applyEntitlement(ctx.db, ctx.user.id, ent);
      const user = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
      return { tier: user ? effectiveTier(user, ctx.now()) : "free", expiresAt: ent.expiresAt, synced: true };
    } catch (err) {
      logger.error("subscription.refresh_failed", { userId: ctx.user.id, error: err instanceof Error ? err.message : String(err) });
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Couldn't confirm your subscription yet. Please try again shortly." });
    }
  }),
});
