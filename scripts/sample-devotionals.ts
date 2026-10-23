// Usage: npm run sample:devotionals -- [count]
// Generates real devotionals for the next N days' verses with the configured AI provider
// and writes them to samples/devotionals.md for quality review. Nothing is saved to the database.
import { mkdirSync, writeFileSync } from "node:fs";
import { DENOMINATIONS } from "../shared/constants";
import { verseForDate } from "../shared/daily-verses";
import { createDb, migrateDb } from "../server/db/client";
import { env } from "../server/env";
import { countWords, createWriterFromEnv } from "../server/services/ai";
import { AiError } from "../server/services/ai";
import { publicDomainProvider, ScriptureService, withRetry } from "../server/services/scripture";

const SITUATIONS = [undefined, "Starting a new job and feeling anxious", undefined, "Caring for my dad after his surgery", undefined];

async function main() {
  const writer = createWriterFromEnv(env);
  if (writer.model === "unconfigured") throw new Error("Set AI_BASE_URL + AI_MODEL (free) or ANTHROPIC_API_KEY in .env");
  const count = Number(process.argv[2] ?? 5);
  const db = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
  await migrateDb(db);
  const scripture = new ScriptureService(db, publicDomainProvider());

  const sections: string[] = [`# Sample devotionals (${writer.model})\n`];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
    const passage = await scripture.getPassage(verseForDate(date));
    const denomination = DENOMINATIONS[i % DENOMINATIONS.length];
    const situation = SITUATIONS[i % SITUATIONS.length];
    const started = Date.now();
    let attempts = 0;
    const d = await withRetry(
      () => {
        attempts++;
        return writer.writeDevotional({ reference: passage.reference, verseText: passage.text, denomination, situation });
      },
      { attempts: 3, baseDelayMs: 500, shouldRetry: (err) => !(err instanceof AiError) || err.retryable },
    );
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${i + 1}/${count} ${passage.reference} — ${countWords(d)} words, ${secs}s, ${attempts} attempt(s)`);
    sections.push(
      [
        `## ${i + 1}. ${d.title}`,
        `*${passage.reference} · ${denomination}${situation ? ` · situation: “${situation}”` : ""} · ${countWords(d)} words · ${secs}s · ${attempts} attempt(s)*`,
        `> ${passage.text}`,
        `**Opening reflection**\n\n${d.openingReflection}`,
        ...d.insights.map((x, n) => `**${n + 1}. ${x.heading}**\n\n${x.body}`),
        `**Closing prayer**\n\n*${d.closingPrayer}*`,
      ].join("\n\n"),
    );
  }
  mkdirSync("samples", { recursive: true });
  writeFileSync("samples/devotionals.md", sections.join("\n\n---\n\n") + "\n");
  console.log("Wrote samples/devotionals.md");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
