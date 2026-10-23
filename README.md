# Daily Grace

A daily devotional app for evangelical Christians: an AI-written devotional on each day's verse, a Bible reader, a private prayer journal, and a moderated community — with Free, Grace Plus ($4.99/mo) and Grace Pro ($9.99/mo) plans.

This repository is a full rebuild from the Manus handoff document. The original Manus project (`/home/ubuntu/daily-grace-app`, checkpoint `f1c53a29`) was not available, so nothing here is carried over from it except the product spec, brand palette, and screen inventory.

## What's in the box

| Area | Implementation |
|---|---|
| App | Expo SDK 58, React Native 0.88, React 19, Expo Router (`src/app`), TanStack Query + tRPC client |
| API | Node + Hono + tRPC v11 (`server/`), Zod validation, structured JSON logs |
| Database | Drizzle ORM on SQLite / libSQL (local file in dev, Turso in production). Migrations in `drizzle/` |
| Auth | Email + password (bcrypt), 30-day JWT in the iOS Keychain / Android Keystore, revoke-all-sessions |
| AI | Any OpenAI-compatible endpoint (free: Ollama locally, Groq or Gemini free tiers) or the Claude API. Server-side only, output validated with Zod |
| Scripture | World English Bible (public domain) via bible-api.com by default; API.Bible when a key is set. Cached server-side |
| Billing | RevenueCat SDK in the app; entitlements decided only by the server (webhook + RevenueCat REST API) |
| Reminders | Local daily notification at the user's chosen time (default 6:00 AM, device timezone) |

### Product behaviour

- **Devotional loop** — one shared verse per day (deterministic rotation in `shared/daily-verses.ts`). On first open the server fetches the passage, checks the plan quota (3 per rolling 7 days on Free), asks Claude for `{ title, openingReflection, insights[3], closingPrayer }`, validates length/structure, and saves it. Repeat calls return the saved devotional. Paid users can have it pre-generated before their reminder (`npm run job:pregenerate`, run hourly).
- **Bible reader** — any chapter of 66 books, reference jump ("Romans 8:28"), prev/next, highlights (4 colours), bookmarks, per-verse notes. Free accounts keep up to 25 highlights and 25 notes.
- **Prayer journal** — create/edit/delete, four categories, filters, answered state with optional note, stats. Grace Plus gets AI topic suggestions by time of day; only *category counts* are sent to the model, never prayer text.
- **Community** — verse reflections and prayer requests. Everyone signed in can read and like; Grace Pro can post and comment. Server-side word filter + link/spam rules, crisis-language detection (shows 988 resources), report → auto-hide after 3 distinct reports → admin queue, two-way blocking, rate limits.
- **Account** — profile, denomination, theme (system/light/dark), larger text, reminder time, sign out / sign out everywhere, and full account deletion.

## Run it locally

Requirements: Node 20+, and for devices either the iOS Simulator / Android emulator or a phone with a development build.

```bash
npm install
```

```bash
cp .env.example .env
```

For free AI devotionals, install [Ollama](https://ollama.com), pull a model, and point `.env` at it (everything else in the app works without AI):

```bash
ollama pull llama3.1:8b
```

```bash
printf 'AI_BASE_URL=http://localhost:11434/v1\nAI_MODEL=llama3.1:8b\n' >> .env
```

To read a few devotionals without opening the app (writes `samples/devotionals.md`, saves nothing to the database):

```bash
npm run sample:devotionals
```

Then start the API and the Expo dev server together:

```bash
npm run dev
```

Press `w` for web, `i` for iOS, `a` for Android. The app finds the API on your computer automatically in development (port 8787).

To moderate community reports, make your account an admin:

```bash
npm run admin:grant -- you@example.com
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API server (watch mode) + Expo |
| `npm run check` | TypeScript, whole repo |
| `npm run lint` | Expo ESLint |
| `npm test` | Vitest: 59 tests covering auth, ownership isolation, quotas, caching, streaks, moderation, billing webhooks, Scripture parsing, and both AI providers' request/parse paths (network stubbed) |
| `npm run build` | Bundles the API to `dist/server.mjs` |
| `npm run start:server` | Runs the built API (applies migrations on boot) |
| `npm run build:web` | Static web export |
| `npm run db:generate` | New Drizzle migration after editing `server/db/schema.ts` |
| `npm run job:pregenerate` | Pre-generates today's devotional for paid users due a reminder within the hour |
| `npm run sample:devotionals` | Writes 5 real devotionals with the configured AI to `samples/devotionals.md` for review |

## Layout

```text
src/app/            Expo Router screens: welcome, sign-in/up, onboarding, (tabs)/{index,devotional,bible,prayers,community},
                    settings, paywall, devotional/[id], devotional/history, post/[id], bookmarks, blocked, moderation,
                    delete-account, legal/[doc]
src/components/     UI kit, devotional view, post card, report/block sheet, crisis notice, upgrade prompt
src/lib/            tRPC client, session, theme, notifications, RevenueCat wrapper, secure token store
server/             Hono app, tRPC routers, Drizzle schema, services (ai, scripture, billing, moderation, auth)
shared/             Bible book table, daily verse rotation, plans/limits/constants (used by app and server)
drizzle/            SQL migrations
scripts/            Pre-generation job, admin grant
tests/              Vitest suites
```

## Security model

- All secrets stay on the server. The app bundle only contains the API URL and RevenueCat *public* SDK keys.
- Every user-owned read/write filters by the caller's user id; cross-user access returns `NOT_FOUND`. Unique indexes prevent duplicate likes, bookmarks, highlights, notes, reports, and blocks.
- The client can never set its plan. `subscriptionTier` is written only by the RevenueCat webhook (shared-secret auth, idempotent on event id) or by the server asking RevenueCat's REST API. Expired subscriptions are treated as Free even before the expiration webhook arrives.
- Internal errors are logged as structured JSON without user content and returned to clients as a generic message.

## Status

See [todo.md](todo.md) for what is done and verified, what needs your accounts, and what is still open. Deployment and store steps are in [DEPLOYMENT.md](DEPLOYMENT.md); the moderation procedure is in [MODERATION.md](MODERATION.md).
