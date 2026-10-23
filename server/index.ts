import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createDb, migrateDb } from "./db/client";
import { env } from "./env";
import { logger } from "./lib/logger";
import { RateLimiter } from "./lib/rate-limit";
import { createWriterFromEnv } from "./services/ai";
import { apiBibleProvider, publicDomainProvider, ScriptureService } from "./services/scripture";

async function main() {
  const db = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
  await migrateDb(db);

  const provider =
    env.BIBLE_API_KEY && env.BIBLE_API_BIBLE_ID ? apiBibleProvider(env.BIBLE_API_KEY, env.BIBLE_API_BIBLE_ID) : publicDomainProvider();
  const writer = createWriterFromEnv(env);

  const app = createApp(
    {
      db,
      jwtSecret: env.JWT_SECRET,
      scripture: new ScriptureService(db, provider),
      writer,
      limiter: new RateLimiter(),
      revenueCatSecretKey: env.REVENUECAT_SECRET_KEY,
      now: () => new Date(),
    },
    { corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()), revenueCatWebhookAuth: env.REVENUECAT_WEBHOOK_AUTH },
  );

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("server.started", {
      port: info.port,
      scripture: provider.translation,
      ai: writer.model,
      billingSync: env.REVENUECAT_SECRET_KEY ? "revenuecat-api" : env.REVENUECAT_WEBHOOK_AUTH ? "webhook-only" : "disabled",
    });
  });
}

main().catch((err) => {
  logger.error("server.crashed", { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
