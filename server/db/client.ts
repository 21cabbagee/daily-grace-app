import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string, authToken?: string) {
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

export async function migrateDb(db: Db) {
  await db.run("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}
