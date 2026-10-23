# Daily Grace — status ledger

Legend: **[x]** done and verified · **[~]** built, not verified end-to-end · **[ ]** open · 🔑 needs the founder's accounts

Verification on 2026-10-23: `npm run check`, `npm run lint`, `npm test` (55 passing), `npm run build`, `npm run build:web` all pass. The web build was clicked through against a local API: welcome → sign-up → onboarding → Home → Today → Bible → Prayers → Community → Settings.

## Architecture decisions

- [x] Backend: self-hosted Node/Hono/tRPC + Drizzle on SQLite/libSQL. **Not Supabase** — chosen so the app runs locally with zero setup and ownership rules live in tested application code. Migrating to Supabase later would mean replacing auth and writing RLS policies for every user-owned table.
- [x] AI: pluggable provider. Free OpenAI-compatible endpoints (Ollama locally; Groq / Gemini free tiers hosted) or the Claude API (`claude-opus-5-5`).
- [x] Scripture: public-domain WEB by default, API.Bible optional.
- [x] Styling: React Native `StyleSheet` with theme tokens (`src/lib/theme.tsx`) instead of NativeWind, to avoid build-config fragility.
- [x] Navigation: 5 tabs (Home, Today, Bible, Prayers, Community); Settings opens from the Home header.

## Milestone 1–3 — Foundation and core loop

- [x] Email/password auth, secure token storage, session revocation, rate-limited sign-in
- [x] Onboarding (welcome, features, denomination, reminder opt-in) persisted server-side
- [x] Daily verse rotation, live Scripture fetch + server cache + stale fallback
- [x] Devotional generation: quota check, idempotent per user/day, structured output, validation, retries for transient errors, persistence
- [x] Free quota (3 per rolling week) enforced on the server
- [x] Devotional quality checked with a free local model (Ollama `llama3.1:8b`, 2026-10-23): 10 generated, readable and on-structure. The prompt was tightened after it wrote in the reader's voice and took a side on baptism. About 1 in 4 attempts fails validation and is retried automatically; 17-55 s each on an M5 laptop.
- [ ] 🔑 Pick the hosted free provider (Groq or Gemini), get a free key, and run `npm run sample:devotionals` against it
- [ ] Consider KJV (also public domain): the WEB says "Yahweh" where most US evangelicals expect "the LORD"
- [~] Claude output quality: request/parse path is tested with a stubbed network; no live Claude call has been made (optional, paid)
- [x] Bible reader: all books/chapters, reference jump, prev/next, highlights, bookmarks, notes, free-tier caps
- [ ] Full-text Bible search (needs API.Bible search endpoint or a local index)
- [ ] Offline reading beyond the server cache

## Milestone 4 — Retention

- [x] Prayer CRUD, categories, filters, answered state + note, stats, optimistic toggle
- [x] AI prayer-topic suggestions (Plus) with no prayer text sent to the model
- [x] Streaks (consecutive local days a devotional was completed) and longest streak
- [x] Devotional history (7 days on Free, full on Plus), favorites, read state, native share
- [~] Daily reminder via local notification at the chosen time — implemented; needs testing on a physical device (web can't schedule notifications)
- [x] Pre-generation job for paid users
- [ ] Analytics (decide on a privacy-respecting provider first)

## Milestone 5 — Community safety

- [x] Feed with pagination and type filter, post detail with comments
- [x] Likes / "praying" (unique per user), comments with accurate counts
- [x] Word filter, link/spam rules, rate limits, crisis detection with 988 resources
- [x] Reports with auto-hide threshold, admin review queue, two-way blocking
- [x] Community guidelines in-app; see MODERATION.md
- [ ] Moderator notifications when a "someone may be at risk" report arrives

## Milestone 6 — Revenue and compliance

- [x] Server-authoritative entitlements (webhook + REST verification, idempotent, expiry-aware)
- [x] Paywall with live store prices, purchase, restore, manage link, subscription disclosure
- [~] RevenueCat purchase flow — code complete, not run against real store products. 🔑 Create products/entitlements/offering per DEPLOYMENT.md and test in sandbox
- [x] In-app account deletion (all user data removed; counters on others' posts recomputed)
- [x] In-app Privacy Policy, Terms, Community Guidelines describing actual data handling
- [ ] 🔑 Legal review of policy text and public hosting of it
- [ ] 🔑 Support email (`EXPO_PUBLIC_SUPPORT_EMAIL`)

## Milestone 7–9 — Beta, launch, growth (founder-owned)

- [ ] 🔑 EAS project, Apple/Google developer accounts, bundle id confirmation (`com.dailygrace.app` is a placeholder)
- [ ] 🔑 Deploy API + database, set secrets, schedule the pre-generation job
- [ ] Crash reporting (e.g. Sentry) and production log retention
- [ ] Final icon from a designer (current one is a generated placeholder), real-device screenshots
- [ ] 🔑 TestFlight / internal testing with 20–50 testers
- [ ] 🔑 Store submission
- [ ] Ads/growth only after analytics and retention are measured

## Known gaps / follow-ups

- [ ] Password reset by email (needs an email provider) — today a user who forgets their password must contact support
- [ ] Sign in with Apple / Google
- [ ] Rate limiter is in-memory (single instance only)
- [ ] Moderation word list is short and English-only
