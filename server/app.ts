import { timingSafeEqual } from "node:crypto";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { logger } from "./lib/logger";
import { appRouter } from "./routers";
import { handleRevenueCatEvent } from "./services/billing";
import { createContext, type AppDeps } from "./trpc";

const WebhookBody = z.object({
  event: z.object({
    id: z.string(),
    type: z.string(),
    app_user_id: z.string(),
    product_id: z.string().nullish(),
    entitlement_ids: z.array(z.string()).nullish(),
    expiration_at_ms: z.number().nullish(),
    environment: z.string().nullish(),
    transferred_to: z.array(z.string()).nullish(),
    transferred_from: z.array(z.string()).nullish(),
  }),
});

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createApp(deps: AppDeps, opts: { corsOrigins: string[]; revenueCatWebhookAuth?: string }) {
  const app = new Hono();

  app.use("/trpc/*", cors({ origin: opts.corsOrigins, allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST"] }));

  app.get("/health", (c) => c.json({ ok: true }));

  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/trpc",
      createContext: (_opts, c) =>
        createContext(deps, c.req.header("authorization"), c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local"),
    }),
  );

  // RevenueCat sends the Authorization value configured in its dashboard with every webhook.
  app.post("/webhooks/revenuecat", async (c) => {
    const expected = opts.revenueCatWebhookAuth;
    if (!expected) return c.json({ error: "webhook not configured" }, 503);
    if (!safeEqual(c.req.header("authorization") ?? "", expected)) return c.json({ error: "unauthorized" }, 401);
    const parsed = WebhookBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad payload" }, 400);
    try {
      const result = await handleRevenueCatEvent(deps.db, parsed.data.event, { secretKey: deps.revenueCatSecretKey });
      logger.info("revenuecat.webhook", { eventId: parsed.data.event.id, type: parsed.data.event.type, result });
      return c.json({ result });
    } catch (err) {
      logger.error("revenuecat.webhook_failed", { eventId: parsed.data.event.id, error: err instanceof Error ? err.message : String(err) });
      // Non-2xx makes RevenueCat retry later.
      return c.json({ error: "processing failed" }, 500);
    }
  });

  return app;
}
