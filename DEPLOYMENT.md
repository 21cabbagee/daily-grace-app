# Deploying Daily Grace

Everything below needs accounts only you can create (Apple, Google, RevenueCat, Anthropic, a host). Nothing here has been configured yet.

## 1. API server

Any Node 20+ host works (Render, Fly.io, Railway, a VPS). The server is a single process.

1. Create a libSQL database on [Turso](https://turso.tech) (or keep a local file on a host with a persistent disk).
2. Set environment variables from `.env.example`:
   - `JWT_SECRET` — `openssl rand -base64 48`. **Required**; the server refuses to start in production without it.
   - `DATABASE_URL` / `DATABASE_AUTH_TOKEN`
   - AI: either `AI_BASE_URL` + `AI_MODEL` (+ `AI_API_KEY`) for a free OpenAI-compatible provider, or `ANTHROPIC_API_KEY` for Claude (see "AI cost and behaviour")
   - `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_KEY`
   - `CORS_ORIGINS` — only needed if you ship the web build
   - `NODE_ENV=production`
3. Build and start:

   ```bash
   npm ci && npm run build && npm run start:server
   ```

   Migrations run automatically on boot. Health check: `GET /health`.
4. Schedule `npm run job:pregenerate` hourly (host cron, or a GitHub Action) so paid users' devotionals are ready before their reminder. Free users generate on first open.
5. The rate limiter is in-memory. Run a single instance, or move it to Redis before scaling out.

### AI cost and behaviour

**Free route.** Ollama is only for development: your laptop can't serve real users. For a hosted app at no cost, use a free tier:

| Provider | `AI_BASE_URL` | Suggested `AI_MODEL` | Notes |
|---|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Free key at console.groq.com; rate-limited |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` | Free key at aistudio.google.com; rate-limited |
| OpenRouter | `https://openrouter.ai/api/v1` | any model ending in `:free` | Free models change often |

Check each provider's current free-tier limits and data terms before launch: some free tiers allow the provider to use prompts to improve their models. Daily Grace never sends prayer-journal text to any model, but the optional "what's on your heart" note *is* sent with the devotional request. Run `npm run sample:devotionals` against the provider you choose and read the output before switching it on. Free tiers have daily request caps; the server caches one devotional per user per day and retries transient failures, but at scale you will outgrow them.

**Claude (paid).** Each devotional is one Claude request (structured JSON, effort `medium`), plus at most three prayer-suggestion requests per Plus user per day. Requests opt into server-side refusal fallbacks (`fallbacks: "default"`) so a safety-classifier decline is retried on Anthropic's recommended fallback model. Set a monthly spend limit in the Anthropic console.

## 2. Scripture licensing

The default translation is the **World English Bible**, which is public domain — no license needed. To use NIV/ESV/NLT etc., get an [API.Bible](https://scripture.api.bible) key, accept that translation's terms, and set `BIBLE_API_KEY` + `BIBLE_API_BIBLE_ID`. Most licensed translations limit caching and require attribution/FUMS reporting; the server caches API.Bible chapters for 24 hours — confirm that is within your translation's terms.

## 3. RevenueCat and store products

1. In App Store Connect create a subscription group **Daily Grace** with two monthly auto-renewing products, e.g. `grace_plus_monthly` ($4.99) and `grace_pro_monthly` ($9.99). Do the same in Google Play Console.
2. In RevenueCat:
   - Create entitlements **`grace_plus`** and **`grace_pro`** (these exact ids are in `shared/constants.ts`). Attach the Plus product to `grace_plus` and the Pro product to both.
   - Create the default offering with packages whose identifiers are **`grace_plus_monthly`** and **`grace_pro_monthly`** (`src/lib/purchases.ts` looks for these).
   - Webhooks → URL `https://<your-api>/webhooks/revenuecat`, Authorization header = your `REVENUECAT_WEBHOOK_AUTH` value.
   - Copy the public iOS/Android SDK keys into `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, and a secret API key into `REVENUECAT_SECRET_KEY` on the server.
3. The app logs into RevenueCat with the Daily Grace user id, so webhook `app_user_id` maps straight to `users.id`.
4. Test with sandbox accounts: buy, restore, upgrade Plus → Pro, cancel, and let a sandbox subscription expire. Check `subscription_events` in the database.

## 4. App builds (EAS)

1. `npx eas-cli@latest login`, then `npx eas-cli@latest init` to link the project (this writes the EAS project id into the config).
2. Bundle id / package are `com.dailygrace.app` in `app.json`; change them now if you own a different identifier.
3. Set `EXPO_PUBLIC_API_URL`, the RevenueCat public keys, and `EXPO_PUBLIC_SUPPORT_EMAIL` as EAS environment variables for the `production` profile.
4. Development build (needed for RevenueCat and notifications; Expo Go can't run them):

   ```bash
   npx eas-cli@latest build --profile development --platform ios
   ```

5. Store builds and submission:

   ```bash
   npx eas-cli@latest build --profile production --platform all
   ```

   ```bash
   npx eas-cli@latest submit --platform ios
   ```

## 5. Store listing checklist

- [ ] Privacy policy and terms published at a public URL (same text as `src/app/legal/[doc].tsx`, reviewed by counsel).
- [ ] Support URL / email.
- [ ] App Privacy (Apple) / Data safety (Google): email, name, user content (prayers, notes, posts), purchase history; no tracking, no ads.
- [ ] Account deletion is in-app (Settings → Delete account) — required by both stores.
- [ ] Subscription disclosure text is on the paywall; add the same to the store description.
- [ ] Content rating questionnaire: user-generated content with reporting and blocking.
- [ ] Screenshots from real builds on a 6.9" and 6.5" iPhone and a Pixel-class Android device.
- [ ] App icon reviewed at launcher sizes; the current icon (`assets/icon.png`) is a generated placeholder cross on the brand gradient — a designer should replace it.
