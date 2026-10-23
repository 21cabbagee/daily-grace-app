import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { hasTier, type SubscriptionTier } from "../shared/constants";
import type { Db } from "./db/client";
import { users, type User } from "./db/schema";
import { logger } from "./lib/logger";
import { RateLimiter } from "./lib/rate-limit";
import type { DevotionalWriter } from "./services/ai";
import { verifySession } from "./services/auth";
import { effectiveTier } from "./services/billing";
import type { ScriptureService } from "./services/scripture";

export type AppDeps = {
  db: Db;
  jwtSecret: string;
  scripture: ScriptureService;
  writer: DevotionalWriter;
  limiter: RateLimiter;
  revenueCatSecretKey?: string;
  now: () => Date;
};

export type Context = AppDeps & {
  user: User | null;
  ip: string;
};

export async function createContext(deps: AppDeps, authHeader: string | null | undefined, ip: string): Promise<Context> {
  let user: User | null = null;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const claims = await verifySession(token, deps.jwtSecret);
    if (claims) {
      const found = await deps.db.query.users.findFirst({ where: eq(users.id, claims.userId) });
      if (found && found.tokenVersion === claims.tokenVersion) user = found;
    }
  }
  return { ...deps, user, ip };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (error.code === "INTERNAL_SERVER_ERROR") {
      // Never leak internals (or user content) to the client.
      logger.error("trpc.internal", { path: shape.data.path, message: error.message });
      return { ...shape, message: "Something went wrong. Please try again." };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
  return next({ ctx: { ...ctx, user: ctx.user, tier: effectiveTier(ctx.user, ctx.now()) } });
});

export function requireTier(current: SubscriptionTier, required: SubscriptionTier, feature: string) {
  if (!hasTier(current, required)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${feature} requires ${required === "pro" ? "Grace Pro" : "Grace Plus"}.`,
      cause: { upgradeRequired: required },
    });
  }
}

export function rateLimit(ctx: Context, key: string, limit: number, windowMs: number) {
  if (!ctx.limiter.take(key, limit, windowMs)) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You're doing that a lot. Please wait a moment and try again." });
  }
}
