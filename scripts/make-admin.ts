// Usage: npm run admin:grant -- someone@example.com
// Grants the moderator/admin role so the account can use the report queue.
import { eq } from "drizzle-orm";
import { createDb, migrateDb } from "../server/db/client";
import { users } from "../server/db/schema";
import { env } from "../server/env";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Pass the account email: npm run admin:grant -- you@example.com");
  const db = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
  await migrateDb(db);
  const rows = await db.update(users).set({ role: "admin" }).where(eq(users.email, email)).returning({ id: users.id });
  if (rows.length === 0) throw new Error(`No account found for ${email}`);
  console.log(`Granted admin to user ${rows[0].id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
