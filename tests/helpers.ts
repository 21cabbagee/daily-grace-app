import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { ScriptureChapter } from "../shared/bible";
import { getBook } from "../shared/bible";
import type { SubscriptionTier } from "../shared/constants";
import { createDb, migrateDb, type Db } from "../server/db/client";
import { users } from "../server/db/schema";
import { RateLimiter } from "../server/lib/rate-limit";
import { appRouter } from "../server/routers";
import type { DevotionalContent, DevotionalWriter } from "../server/services/ai";
import { ScriptureService, type ScriptureProvider } from "../server/services/scripture";
import type { AppDeps } from "../server/trpc";

export const SECRET = "test-secret-test-secret-test-secret-0000";

export function fakeDevotional(): DevotionalContent {
  const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  return {
    title: "Peace in every season",
    openingReflection: para(75),
    insights: [
      { heading: "God hears", body: para(50) },
      { heading: "Peace guards", body: para(50) },
      { heading: "Give thanks", body: para(50) },
    ],
    closingPrayer: `${para(50)} Amen.`,
  };
}

export class FakeWriter implements DevotionalWriter {
  model = "fake-model";
  devotionalCalls = 0;
  suggestionCalls = 0;
  lastInput: unknown = null;
  failWith: Error | null = null;

  async writeDevotional(input: unknown) {
    this.devotionalCalls += 1;
    this.lastInput = input;
    if (this.failWith) throw this.failWith;
    return fakeDevotional();
  }
  async suggestPrayerTopics(input: unknown) {
    this.suggestionCalls += 1;
    this.lastInput = input;
    return [
      { topic: "Gratitude", prompt: "Thank God for one thing today." },
      { topic: "A friend", prompt: "Pray for someone who is struggling." },
      { topic: "Guidance", prompt: "Ask for wisdom in a decision." },
    ];
  }
}

export class FakeProvider implements ScriptureProvider {
  translation = "test";
  cacheTtlMs = Number.POSITIVE_INFINITY;
  calls = 0;
  async fetchChapter(bookId: string, chapter: number): Promise<ScriptureChapter> {
    this.calls += 1;
    return {
      bookId,
      bookName: getBook(bookId)?.name ?? bookId,
      chapter,
      translation: "test",
      translationName: "Test Bible",
      copyright: "Public Domain",
      verses: Array.from({ length: 40 }, (_, i) => ({ verse: i + 1, text: `${bookId} ${chapter}:${i + 1} text` })),
    };
  }
}

export interface Harness {
  db: Db;
  deps: AppDeps;
  writer: FakeWriter;
  provider: FakeProvider;
  clock: { now: Date };
  /** Signs up a user and returns a tRPC caller acting as them. */
  signUp: (name: string, opts?: { tier?: SubscriptionTier; role?: "user" | "admin"; timezone?: string }) => Promise<{ id: number; token: string; caller: ReturnType<typeof appRouter.createCaller> }>;
  callerFor: (token: string | null) => Promise<ReturnType<typeof appRouter.createCaller>>;
}

let counter = 0;

export async function createHarness(): Promise<Harness> {
  const dir = mkdtempSync(path.join(tmpdir(), "dg-test-"));
  const db = createDb(`file:${path.join(dir, `db-${counter++}.sqlite`)}`);
  await migrateDb(db);
  const writer = new FakeWriter();
  const provider = new FakeProvider();
  const clock = { now: new Date("2026-10-23T14:00:00Z") };
  const deps: AppDeps = {
    db,
    jwtSecret: SECRET,
    scripture: new ScriptureService(db, provider),
    writer,
    limiter: new RateLimiter(() => clock.now.getTime()),
    now: () => clock.now,
  };

  const { createContext } = await import("../server/trpc");
  // A fresh context per call, like real HTTP requests, so the caller sees updated user rows.
  const callerFor = async (token: string | null) => appRouter.createCaller(() => createContext(deps, token ? `Bearer ${token}` : null, "127.0.0.1"));

  const signUp: Harness["signUp"] = async (name, opts = {}) => {
    const anon = await callerFor(null);
    const { token, user } = await anon.auth.signUp({
      name,
      email: `${name.toLowerCase()}-${counter++}@example.com`,
      password: "correct horse battery",
      timezone: opts.timezone ?? "America/Chicago",
    });
    if (opts.tier || opts.role) {
      await db
        .update(users)
        .set({ subscriptionTier: opts.tier ?? "free", role: opts.role ?? "user" })
        .where(eq(users.id, user.id));
    }
    return { id: user.id, token, caller: await callerFor(token) };
  };

  return { db, deps, writer, provider, clock, signUp, callerFor };
}

export async function expectTrpcError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (err) {
    const actual = (err as { code?: string }).code;
    if (actual !== code) throw new Error(`Expected TRPCError ${code}, got ${actual}: ${(err as Error).message}`);
    return err as Error;
  }
  throw new Error(`Expected TRPCError ${code}, but the call succeeded`);
}
