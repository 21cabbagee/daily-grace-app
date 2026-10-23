import { and, eq } from "drizzle-orm";
import { formatReference, getBook, isValidChapter, type ScriptureChapter, type VerseRef } from "../../shared/bible";
import type { Db } from "../db/client";
import { scriptureCache } from "../db/schema";

type FetchFn = typeof fetch;

export interface ScriptureProvider {
  /** Short id stored in the cache key, e.g. "web" or an API.Bible bible id. */
  translation: string;
  /** How long a cached chapter may be served before refetching. */
  cacheTtlMs: number;
  fetchChapter(bookId: string, chapter: number): Promise<ScriptureChapter>;
}

export class ScriptureError extends Error {}

/**
 * World English Bible via bible-api.com. The WEB is public domain, so it can be cached
 * and redistributed without a license. This is the default when no API.Bible key is set.
 */
export function publicDomainProvider(fetchFn: FetchFn = fetch): ScriptureProvider {
  return {
    translation: "web",
    cacheTtlMs: Number.POSITIVE_INFINITY,
    async fetchChapter(bookId, chapter) {
      const res = await fetchFn(`https://bible-api.com/data/web/${bookId}/${chapter}`);
      if (!res.ok) throw new ScriptureError(`Scripture service returned ${res.status}`);
      const body = (await res.json()) as {
        translation: { name: string; license: string };
        verses: { verse: number; text: string }[];
      };
      return {
        bookId,
        bookName: getBook(bookId)?.name ?? bookId,
        chapter,
        translation: "web",
        translationName: body.translation?.name ?? "World English Bible",
        copyright: body.translation?.license ?? "Public Domain",
        verses: body.verses.map((v) => ({ verse: v.verse, text: v.text.replace(/\s+/g, " ").trim() })),
      };
    },
  };
}

/**
 * API.Bible (https://rest.api.bible/v1). Requires a key and a licensed bible id.
 * Cached for 24 hours only; check the translation's license terms before raising this.
 */
export function apiBibleProvider(apiKey: string, bibleId: string, fetchFn: FetchFn = fetch): ScriptureProvider {
  return {
    translation: bibleId,
    cacheTtlMs: 24 * 60 * 60 * 1000,
    async fetchChapter(bookId, chapter) {
      const url = `https://rest.api.bible/v1/bibles/${encodeURIComponent(bibleId)}/chapters/${bookId}.${chapter}?content-type=text&include-verse-numbers=true&include-titles=false&include-notes=false`;
      const res = await fetchFn(url, { headers: { "api-key": apiKey } });
      if (!res.ok) throw new ScriptureError(`API.Bible returned ${res.status}`);
      const body = (await res.json()) as { data: { content: string; copyright?: string } };
      return {
        bookId,
        bookName: getBook(bookId)?.name ?? bookId,
        chapter,
        translation: bibleId,
        translationName: bibleId,
        copyright: body.data.copyright ?? "",
        verses: parseNumberedText(body.data.content),
      };
    },
  };
}

/** Parses "[1] In the beginning... [2] Now the earth..." into verses. */
export function parseNumberedText(content: string) {
  const parts = content.split(/\[(\d+)\]/);
  const verses: { verse: number; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1]?.replace(/\s+/g, " ").trim() ?? "";
    if (text) verses.push({ verse: Number(parts[i]), text });
  }
  return verses;
}

export class ScriptureService {
  constructor(
    private db: Db,
    private provider: ScriptureProvider,
  ) {}

  async getChapter(bookId: string, chapter: number): Promise<ScriptureChapter> {
    if (!isValidChapter(bookId, chapter)) throw new ScriptureError("Unknown book or chapter");
    const key = and(
      eq(scriptureCache.translation, this.provider.translation),
      eq(scriptureCache.bookId, bookId),
      eq(scriptureCache.chapter, chapter),
    );
    const cached = await this.db.query.scriptureCache.findFirst({ where: key });
    if (cached && Date.now() - cached.fetchedAt.getTime() < this.provider.cacheTtlMs) {
      return JSON.parse(cached.payload) as ScriptureChapter;
    }

    let fresh: ScriptureChapter;
    try {
      fresh = await withRetry(() => this.provider.fetchChapter(bookId, chapter));
    } catch (err) {
      // Serve stale content rather than failing if the upstream is down.
      if (cached) return JSON.parse(cached.payload) as ScriptureChapter;
      throw err;
    }
    if (fresh.verses.length === 0) throw new ScriptureError("Chapter has no verses");

    const payload = JSON.stringify(fresh);
    await this.db
      .insert(scriptureCache)
      .values({ translation: this.provider.translation, bookId, chapter, payload, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [scriptureCache.translation, scriptureCache.bookId, scriptureCache.chapter],
        set: { payload, fetchedAt: new Date() },
      });
    return fresh;
  }

  async getPassage(ref: VerseRef) {
    const chapter = await this.getChapter(ref.bookId, ref.chapter);
    const verses = chapter.verses.filter((v) => v.verse >= ref.verseStart && v.verse <= ref.verseEnd);
    if (verses.length === 0) throw new ScriptureError("Verse not found");
    return {
      ...ref,
      reference: formatReference(ref),
      text: verses.map((v) => v.text).join(" "),
      translationName: chapter.translationName,
      copyright: chapter.copyright,
    };
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 300, shouldRetry = () => true }: { attempts?: number; baseDelayMs?: number; shouldRetry?: (err: unknown) => boolean } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw lastErr;
}
