# HANDOFF — read this first

You are an AI coding agent continuing **Daily Grace**. This file tells you what exists, how to verify it, the rules, and the remaining work in order. Keep it current: when you finish a task, tick it here and in `todo.md`, and add anything new you discover.

Last updated: 2026-10-23 (commit after `e866e4f`).

---

## 1. Constraints from the founder (do not violate)

1. **Zero budget.** Only free services. Never add a paid dependency or tell the founder to buy something unless there is no free path (the Apple developer account, $99/yr, and Google Play, $25 one-time, are the only unavoidable costs, and only at store launch).
2. **AI must stay free by default.** Use the OpenAI-compatible provider (`AI_BASE_URL`): Ollama locally, Groq or Gemini free tiers in production. Claude (`ANTHROPIC_API_KEY`) is an optional paid path — keep it working, don't make it required.
3. **Never commit secrets.** `.env` is git-ignored. Never print or paste key values.
4. **Don't claim things work without running them.** Mark unverified work `[~]` in `todo.md`.
5. **Ask the founder before** creating accounts, publishing, submitting to stores, or anything outward-facing. Things needing their accounts are marked 🔑.

## 2. What exists (all working, all tested)

- **App** — Expo SDK 58 / React Native 0.88 / Expo Router in `src/app`. Screens: welcome, sign-in, sign-up, onboarding (4 steps), tabs `(tabs)/{index,devotional,bible,prayers,community}`, settings, paywall, devotional/[id], devotional/history, post/[id], bookmarks, blocked, moderation, delete-account, legal/[doc].
- **API** — Node + Hono + tRPC v11 in `server/`. Routers: auth, user, devotional, prayers, bible, community, subscription, admin. RevenueCat webhook at `POST /webhooks/revenuecat`. Health at `GET /health`.
- **DB** — Drizzle ORM on SQLite/libSQL (`server/db/schema.ts`, migrations in `drizzle/`). Local file by default; Turso (free tier) for production. Migrations run on server boot.
- **AI** — `server/services/ai.ts`: `createWriterFromEnv` picks OpenAI-compatible (if `AI_BASE_URL`) else Claude else "unconfigured". Output validated with Zod + `validateDevotional` (3 insights, 200–480 words). Router retries retryable failures.
- **Scripture** — World English Bible (public domain) from bible-api.com, cached in `scripture_cache`. API.Bible optional.
- **Billing** — RevenueCat in the app (`src/lib/purchases.ts`); tier is only ever written by the server (`server/services/billing.ts`).
- **Tests** — 59 Vitest tests in `tests/` (auth, ownership, devotional quotas/streaks, community/moderation, billing/webhooks, scripture, both AI providers with stubbed network).

Read next, in order: `README.md` → `AGENTS.md` (code rules) → `todo.md` (status ledger) → `DEPLOYMENT.md` → `MODERATION.md`.

## 3. Set up and verify (do this before changing anything)

```bash
npm install
```

```bash
printf 'AI_BASE_URL=http://localhost:11434/v1\nAI_MODEL=llama3.1:8b\n' > .env
```

```bash
npm run check && npm run lint && npm test && npm run build
```

All four must pass before and after every change. To see real AI output for free (needs Ollama running with `llama3.1:8b`):

```bash
npm run sample:devotionals
```

To run the full app (API on 8787 + Expo; press `w` for web):

```bash
npm run dev
```

## 4. Environment gotchas on the founder's Mac

- **`git` is blocked** until the founder runs `sudo xcodebuild -license` (you cannot do this — it needs their password). Until then, commits/pushes were done with **isomorphic-git** (pure JS) from a scratch folder, authenticating with `gh auth token`. `gh` itself works. If `git status` fails with an Xcode license message, use that approach or ask the founder to accept the license.
- **`npx expo install` fails** with `EALLOWSCRIPTS` on this npm (11.19). Install Expo packages by reading the version from `node_modules/expo/bundledNativeModules.json` and running `npm install <pkg>@<version>`.
- **Port clash:** preview tools set `PORT=8081`, which the API also reads. Start the API with `PORT=8787` explicitly when Expo is on 8081.
- **Browser automation:** clicks by element ref on React Native Web lists sometimes miss; click by coordinate or dispatch a DOM `.click()` instead.
- **Expo changes fast** — check `https://docs.expo.dev/versions/v58.0.0/` before using any Expo API from memory (see `AGENTS.md`).

## 5. Remaining work, in priority order

Each task says who can do it. **Agent** = you can do it alone. **🔑 Founder** = needs their account/action; prepare everything, then give them exact steps.

### A. Before launch (product)

1. **Agent — Translation choice.** WEB uses "Yahweh"; US evangelicals expect "the LORD". bible-api.com also serves `kjv` (public domain). Add `BIBLE_TRANSLATION=web|kjv` to `server/env.ts`, pass it to `publicDomainProvider`, include it in the cache key (already keyed by `translation`), update tests and docs. Ask the founder which default they want.
2. **Agent — Password reset.** Currently impossible without support. Free path: email via Resend free tier (needs 🔑 founder key) with a one-time code table, or a lower-tech fallback: allow changing the password while signed in (`auth.changePassword`) now, and email reset later. Add tests.
3. **Agent — Change password while signed in** (part of 2; ship this first, no external service).
4. **Agent — Moderator alert** when a `self_harm` report arrives (log at `warn` + optional free webhook such as a Discord channel URL in `MODERATION_WEBHOOK_URL`).
5. **Agent — Stronger AI output checks for the small free models:** reject devotionals that quote verses not in the supplied passage (simple check: any `Book N:N` reference in the output other than the supplied one), and log the validation-failure rate.
6. **Agent — Real-device notification test plan** in `todo.md`; code exists in `src/lib/notifications.ts` but has only run on web (where it no-ops).

### B. Go live for free

7. **🔑 Founder + Agent — Hosted AI.** Founder creates a free key at console.groq.com (or aistudio.google.com). Agent sets `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY` in local `.env`, runs `npm run sample:devotionals`, reviews quality, and records results in `todo.md`. Provider table is in `DEPLOYMENT.md`.
8. **🔑 Founder + Agent — Database.** Founder creates a free Turso database; agent documents/sets `DATABASE_URL` + `DATABASE_AUTH_TOKEN`.
9. **🔑 Founder + Agent — API hosting on a free tier.** Pick a free Node host that allows a persistent process (verify current free-tier terms before recommending; free tiers change). Agent may add a `Dockerfile` or host config file. Required env: `NODE_ENV=production`, `JWT_SECRET` (generate with `openssl rand -base64 48`), DB vars, AI vars.
10. **Agent — Pre-generation schedule.** Add `.github/workflows/pregenerate.yml` (hourly cron, free on GitHub Actions) that runs `npm run job:pregenerate` with secrets from repo settings. 🔑 Founder adds the secrets.
11. **Agent — Point the app at the hosted API** via `EXPO_PUBLIC_API_URL` (EAS env var), and confirm CORS if shipping web.

### C. Store launch (has unavoidable costs — confirm with founder first)

12. **🔑 Founder** — Apple Developer ($99/yr) and Google Play ($25) accounts; confirm or change bundle id `com.dailygrace.app` in `app.json`.
13. **🔑 Founder + Agent** — RevenueCat (free tier) products/entitlements/offering exactly as in `DEPLOYMENT.md` §3; sandbox purchase/restore/upgrade/expire test.
14. **Agent** — `npx eas-cli@latest build --profile development` instructions; then production builds (EAS free tier has limited monthly builds).
15. **🔑 Founder** — legal review of `src/app/legal/[doc].tsx`, host the same text publicly (free: GitHub Pages from this repo — agent can set that up), support email in `EXPO_PUBLIC_SUPPORT_EMAIL`.
16. **Agent** — replace the generated placeholder icon (`assets/*.png`) if the founder supplies artwork; produce screenshots from a real build.

### D. Nice to have

- Full-text Bible search; offline reading; Sign in with Apple/Google; Redis-backed rate limiter for multi-instance; analytics (privacy-respecting, free tier); larger moderation word list.

## 6. Definition of done for any task

1. Code follows `AGENTS.md` (ownership filters, no client-trusted billing, no logging user text).
2. New behavior has tests; `npm run check && npm run lint && npm test && npm run build` pass.
3. Schema changes have a migration (`npm run db:generate`) committed.
4. `todo.md` and this file are updated honestly.
5. Commit message explains *why*; push to `main` (or a branch + PR if the founder asks).
