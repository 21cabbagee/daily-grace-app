// Pre-generates today's devotional for paid subscribers shortly before their reminder time,
// so it is ready when the 6 a.m. notification arrives. Run it hourly from a scheduler
// (cron, Render/Fly cron job, GitHub Actions). Free users generate on first open instead,
// so a devotional they never open doesn't use one of their weekly three.
import { and, eq, ne } from "drizzle-orm";
import { createDb, migrateDb } from "../server/db/client";
import { devotionals, users } from "../server/db/schema";
import { env } from "../server/env";
import { localDate, localHour } from "../server/lib/dates";
import { logger } from "../server/lib/logger";
import { RateLimiter } from "../server/lib/rate-limit";
import { appRouter } from "../server/routers";
import { createWriterFromEnv } from "../server/services/ai";
import { effectiveTier } from "../server/services/billing";
import { apiBibleProvider, publicDomainProvider, ScriptureService } from "../server/services/scripture";

async function main() {
  const writer = createWriterFromEnv(env);
  if (writer.model === "unconfigured") throw new Error("Set AI_BASE_URL + AI_MODEL or ANTHROPIC_API_KEY");
  const db = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
  await migrateDb(db);
  const provider =
    env.BIBLE_API_KEY && env.BIBLE_API_BIBLE_ID ? apiBibleProvider(env.BIBLE_API_KEY, env.BIBLE_API_BIBLE_ID) : publicDomainProvider();
  const deps = {
    db,
    jwtSecret: env.JWT_SECRET,
    scripture: new ScriptureService(db, provider),
    writer,
    limiter: new RateLimiter(),
    now: () => new Date(),
  };

  const now = new Date();
  const candidates = await db.select().from(users).where(ne(users.subscriptionTier, "free"));
  let generated = 0;
  for (const user of candidates) {
    if (effectiveTier(user, now) === "free") continue;
    // Run during the hour before the user's reminder.
    const targetHour = (user.reminderHour + 23) % 24;
    if (localHour(user.timezone, now) !== targetHour) continue;
    const date = localDate(user.timezone, now);
    const exists = await db.query.devotionals.findFirst({ where: and(eq(devotionals.userId, user.id), eq(devotionals.date, date)) });
    if (exists) continue;
    try {
      await appRouter.createCaller({ ...deps, user, ip: "job" }).devotional.generate();
      generated += 1;
    } catch (err) {
      logger.error("job.pregenerate_failed", { userId: user.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  logger.info("job.pregenerate_done", { candidates: candidates.length, generated });
}

main().catch((err) => {
  logger.error("job.pregenerate_crashed", { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
