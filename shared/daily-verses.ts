import type { VerseRef } from "./bible";

// Curated rotation of encouraging passages. The verse for a date is chosen
// deterministically so every user (and the community feed) shares the same verse each day.
export const DAILY_VERSES: readonly VerseRef[] = [
  { bookId: "PHP", chapter: 4, verseStart: 6, verseEnd: 7 },
  { bookId: "JHN", chapter: 3, verseStart: 16, verseEnd: 17 },
  { bookId: "PSA", chapter: 23, verseStart: 1, verseEnd: 3 },
  { bookId: "ROM", chapter: 8, verseStart: 28, verseEnd: 28 },
  { bookId: "JER", chapter: 29, verseStart: 11, verseEnd: 11 },
  { bookId: "ISA", chapter: 40, verseStart: 31, verseEnd: 31 },
  { bookId: "PRO", chapter: 3, verseStart: 5, verseEnd: 6 },
  { bookId: "MAT", chapter: 11, verseStart: 28, verseEnd: 30 },
  { bookId: "JOS", chapter: 1, verseStart: 9, verseEnd: 9 },
  { bookId: "PSA", chapter: 46, verseStart: 1, verseEnd: 2 },
  { bookId: "2CO", chapter: 5, verseStart: 17, verseEnd: 17 },
  { bookId: "GAL", chapter: 5, verseStart: 22, verseEnd: 23 },
  { bookId: "EPH", chapter: 2, verseStart: 8, verseEnd: 10 },
  { bookId: "HEB", chapter: 11, verseStart: 1, verseEnd: 1 },
  { bookId: "ROM", chapter: 12, verseStart: 2, verseEnd: 2 },
  { bookId: "1CO", chapter: 13, verseStart: 4, verseEnd: 7 },
  { bookId: "PSA", chapter: 119, verseStart: 105, verseEnd: 105 },
  { bookId: "ISA", chapter: 41, verseStart: 10, verseEnd: 10 },
  { bookId: "MAT", chapter: 6, verseStart: 33, verseEnd: 34 },
  { bookId: "1PE", chapter: 5, verseStart: 6, verseEnd: 7 },
  { bookId: "JAS", chapter: 1, verseStart: 2, verseEnd: 4 },
  { bookId: "PSA", chapter: 37, verseStart: 4, verseEnd: 5 },
  { bookId: "LAM", chapter: 3, verseStart: 22, verseEnd: 23 },
  { bookId: "ROM", chapter: 15, verseStart: 13, verseEnd: 13 },
  { bookId: "COL", chapter: 3, verseStart: 23, verseEnd: 24 },
  { bookId: "PHP", chapter: 4, verseStart: 13, verseEnd: 13 },
  { bookId: "JHN", chapter: 14, verseStart: 27, verseEnd: 27 },
  { bookId: "PSA", chapter: 139, verseStart: 13, verseEnd: 14 },
  { bookId: "MIC", chapter: 6, verseStart: 8, verseEnd: 8 },
  { bookId: "1JN", chapter: 4, verseStart: 18, verseEnd: 19 },
  { bookId: "2TI", chapter: 1, verseStart: 7, verseEnd: 7 },
  { bookId: "ZEP", chapter: 3, verseStart: 17, verseEnd: 17 },
  { bookId: "PSA", chapter: 34, verseStart: 18, verseEnd: 18 },
  { bookId: "JHN", chapter: 15, verseStart: 5, verseEnd: 5 },
  { bookId: "ROM", chapter: 5, verseStart: 3, verseEnd: 5 },
  { bookId: "DEU", chapter: 31, verseStart: 6, verseEnd: 6 },
  { bookId: "HEB", chapter: 12, verseStart: 1, verseEnd: 2 },
  { bookId: "1TH", chapter: 5, verseStart: 16, verseEnd: 18 },
  { bookId: "PSA", chapter: 91, verseStart: 1, verseEnd: 2 },
  { bookId: "ISA", chapter: 26, verseStart: 3, verseEnd: 3 },
  { bookId: "MAT", chapter: 5, verseStart: 14, verseEnd: 16 },
  { bookId: "EPH", chapter: 3, verseStart: 20, verseEnd: 21 },
  { bookId: "JHN", chapter: 16, verseStart: 33, verseEnd: 33 },
  { bookId: "PSA", chapter: 121, verseStart: 1, verseEnd: 2 },
  { bookId: "ROM", chapter: 8, verseStart: 38, verseEnd: 39 },
  { bookId: "2CO", chapter: 12, verseStart: 9, verseEnd: 9 },
  { bookId: "NUM", chapter: 6, verseStart: 24, verseEnd: 26 },
  { bookId: "PRO", chapter: 16, verseStart: 3, verseEnd: 3 },
  { bookId: "GAL", chapter: 6, verseStart: 9, verseEnd: 9 },
  { bookId: "1CO", chapter: 10, verseStart: 13, verseEnd: 13 },
  { bookId: "PSA", chapter: 27, verseStart: 1, verseEnd: 1 },
  { bookId: "HEB", chapter: 4, verseStart: 16, verseEnd: 16 },
  { bookId: "ISA", chapter: 43, verseStart: 2, verseEnd: 2 },
  { bookId: "MAT", chapter: 28, verseStart: 19, verseEnd: 20 },
  { bookId: "JAS", chapter: 1, verseStart: 5, verseEnd: 5 },
  { bookId: "PSA", chapter: 103, verseStart: 11, verseEnd: 12 },
  { bookId: "EPH", chapter: 4, verseStart: 32, verseEnd: 32 },
  { bookId: "JHN", chapter: 8, verseStart: 12, verseEnd: 12 },
  { bookId: "ROM", chapter: 10, verseStart: 9, verseEnd: 9 },
  { bookId: "PHP", chapter: 1, verseStart: 6, verseEnd: 6 },
];

/** Days since 1970-01-01 for a YYYY-MM-DD string, independent of the machine timezone. */
export function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function verseForDate(isoDate: string): VerseRef {
  const n = dayNumber(isoDate);
  return DAILY_VERSES[((n % DAILY_VERSES.length) + DAILY_VERSES.length) % DAILY_VERSES.length];
}
