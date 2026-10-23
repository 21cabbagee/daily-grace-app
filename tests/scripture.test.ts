import { describe, expect, it } from "vitest";
import { apiBibleProvider, parseNumberedText, publicDomainProvider, ScriptureError, ScriptureService, withRetry } from "../server/services/scripture";
import { BIBLE_BOOKS, formatReference, parseReference } from "../shared/bible";
import { DAILY_VERSES } from "../shared/daily-verses";
import { createHarness } from "./helpers";

describe("scripture service", () => {
  it("caches chapters after the first fetch", async () => {
    const h = await createHarness();
    await h.deps.scripture.getChapter("JHN", 3);
    await h.deps.scripture.getChapter("JHN", 3);
    expect(h.provider.calls).toBe(1);
  });

  it("validates chapter bounds before calling the provider", async () => {
    const h = await createHarness();
    await expect(h.deps.scripture.getChapter("JHN", 22)).rejects.toBeInstanceOf(ScriptureError);
    await expect(h.deps.scripture.getChapter("NOPE", 1)).rejects.toBeInstanceOf(ScriptureError);
    expect(h.provider.calls).toBe(0);
  });

  it("serves stale cache when the provider fails", async () => {
    const h = await createHarness();
    await h.deps.scripture.getChapter("PSA", 23);
    const failing = new ScriptureService(h.db, {
      translation: "test",
      cacheTtlMs: 0,
      fetchChapter: async () => {
        throw new Error("down");
      },
    });
    const chapter = await failing.getChapter("PSA", 23);
    expect(chapter.verses.length).toBeGreaterThan(0);
  });

  it("extracts a passage range", async () => {
    const h = await createHarness();
    const p = await h.deps.scripture.getPassage({ bookId: "PHP", chapter: 4, verseStart: 6, verseEnd: 7 });
    expect(p.reference).toBe("Philippians 4:6-7");
    expect(p.text).toBe("PHP 4:6 text PHP 4:7 text");
  });

  it("parses the public-domain API response", async () => {
    const fetchFn = (async (url: string) => {
      expect(url).toBe("https://bible-api.com/data/web/JHN/3");
      return new Response(
        JSON.stringify({
          translation: { name: "World English Bible", license: "Public Domain" },
          verses: [{ verse: 16, text: "For God so loved\nthe world " }],
        }),
      );
    }) as unknown as typeof fetch;
    const ch = await publicDomainProvider(fetchFn).fetchChapter("JHN", 3);
    expect(ch.verses).toEqual([{ verse: 16, text: "For God so loved the world" }]);
  });

  it("parses API.Bible numbered text and sends the api-key header", async () => {
    expect(parseNumberedText("  [1] In the beginning  [2] Now the earth ")).toEqual([
      { verse: 1, text: "In the beginning" },
      { verse: 2, text: "Now the earth" },
    ]);
    const fetchFn = (async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["api-key"]).toBe("k");
      return new Response(JSON.stringify({ data: { content: "[1] Hi", copyright: "©" } }));
    }) as unknown as typeof fetch;
    const ch = await apiBibleProvider("k", "bible-id", fetchFn).fetchChapter("GEN", 1);
    expect(ch.verses).toEqual([{ verse: 1, text: "Hi" }]);
  });

  it("retries with backoff and respects shouldRetry", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new Error("x");
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow("x");
    expect(n).toBe(3);
    n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new Error("y");
        },
        { attempts: 3, baseDelayMs: 1, shouldRetry: () => false },
      ),
    ).rejects.toThrow("y");
    expect(n).toBe(1);
  });
});

describe("bible reference helpers", () => {
  it("has 66 books and valid daily verses", () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    for (const v of DAILY_VERSES) {
      const book = BIBLE_BOOKS.find((b) => b.id === v.bookId);
      expect(book, v.bookId).toBeDefined();
      expect(v.chapter).toBeLessThanOrEqual(book!.chapters);
      expect(v.verseEnd).toBeGreaterThanOrEqual(v.verseStart);
    }
  });

  it("parses common reference formats", () => {
    expect(parseReference("John 3:16")).toEqual({ bookId: "JHN", chapter: 3, verse: 16 });
    expect(parseReference("1 cor 13")).toEqual({ bookId: "1CO", chapter: 13, verse: undefined });
    expect(parseReference("psalm 23")).toEqual({ bookId: "PSA", chapter: 23, verse: undefined });
    expect(parseReference("Rev 22:21")).toEqual({ bookId: "REV", chapter: 22, verse: 21 });
    expect(parseReference("Genesis")).toEqual({ bookId: "GEN", chapter: 1, verse: undefined });
    expect(parseReference("John 99")).toBeNull();
    expect(parseReference("Hezekiah 1")).toBeNull();
  });

  it("formats references", () => {
    expect(formatReference({ bookId: "ROM", chapter: 8, verseStart: 28, verseEnd: 28 })).toBe("Romans 8:28");
  });
});
