import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { effectiveTier, entitlementFromEvent, fetchRevenueCatEntitlement, handleRevenueCatEvent } from "../server/services/billing";
import { createHarness } from "./helpers";

const event = (over: Record<string, unknown> = {}) => ({
  id: `evt-${Math.random()}`,
  type: "INITIAL_PURCHASE",
  app_user_id: "1",
  product_id: "grace_plus_monthly",
  entitlement_ids: ["grace_plus"],
  expiration_at_ms: Date.parse("2026-11-23T00:00:00Z"),
  environment: "SANDBOX",
  ...over,
});

describe("billing", () => {
  it("never lets the client set its own tier", async () => {
    const h = await createHarness();
    const { caller } = await h.signUp("Mallory");
    // updateProfile ignores unknown keys like subscriptionTier.
    await caller.user.updateProfile({ name: "Mallory", ...({ subscriptionTier: "pro" } as object) });
    expect((await caller.auth.me())?.tier).toBe("free");
  });

  it("applies webhook events idempotently", async () => {
    const h = await createHarness();
    const { id, caller } = await h.signUp("Paying");
    const e = event({ app_user_id: String(id) });
    expect(await handleRevenueCatEvent(h.db, e)).toBe("processed");
    expect(await handleRevenueCatEvent(h.db, e)).toBe("duplicate");
    expect((await caller.auth.me())?.tier).toBe("plus");

    await handleRevenueCatEvent(h.db, event({ app_user_id: String(id), type: "PRODUCT_CHANGE", entitlement_ids: ["grace_pro", "grace_plus"] }));
    expect((await caller.auth.me())?.tier).toBe("pro");

    await handleRevenueCatEvent(h.db, event({ app_user_id: String(id), type: "EXPIRATION", entitlement_ids: [] }));
    expect((await caller.auth.me())?.tier).toBe("free");
  });

  it("ignores unknown app user ids", async () => {
    const h = await createHarness();
    expect(await handleRevenueCatEvent(h.db, event({ app_user_id: "$RCAnonymousID:abc" }))).toBe("ignored");
    expect(await handleRevenueCatEvent(h.db, event({ app_user_id: "99999" }))).toBe("ignored");
  });

  it("treats an expired subscription as free even before the EXPIRATION webhook", () => {
    const now = new Date("2026-10-23T00:00:00Z");
    expect(effectiveTier({ subscriptionTier: "pro", subscriptionExpiresAt: new Date("2026-10-22T00:00:00Z") }, now)).toBe("free");
    expect(effectiveTier({ subscriptionTier: "pro", subscriptionExpiresAt: new Date("2026-10-24T00:00:00Z") }, now)).toBe("pro");
    expect(effectiveTier({ subscriptionTier: "plus", subscriptionExpiresAt: null }, now)).toBe("plus");
  });

  it("keeps access through the paid period after CANCELLATION and ignores informational events", () => {
    expect(entitlementFromEvent(event({ type: "CANCELLATION" }))?.tier).toBe("plus");
    expect(entitlementFromEvent(event({ type: "BILLING_ISSUE" }))).toBeNull();
    expect(entitlementFromEvent(event({ type: "TEST" }))).toBeNull();
  });

  it("reads entitlements from the RevenueCat REST API", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const fetchFn = (async () =>
      new Response(JSON.stringify({ subscriber: { entitlements: { grace_plus: { expires_date: future }, grace_pro: { expires_date: past } } } }))) as typeof fetch;
    const ent = await fetchRevenueCatEntitlement("1", "sk_test", fetchFn);
    expect(ent.tier).toBe("plus");
  });

  it("authenticates the webhook endpoint", async () => {
    const h = await createHarness();
    const { id } = await h.signUp("Hook");
    const app = createApp(h.deps, { corsOrigins: ["http://localhost"], revenueCatWebhookAuth: "Bearer hook-secret" });
    const body = JSON.stringify({ event: event({ app_user_id: String(id) }) });
    const bad = await app.request("/webhooks/revenuecat", { method: "POST", body, headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" } });
    expect(bad.status).toBe(401);
    const good = await app.request("/webhooks/revenuecat", {
      method: "POST",
      body,
      headers: { Authorization: "Bearer hook-secret", "Content-Type": "application/json" },
    });
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ result: "processed" });
    const malformed = await app.request("/webhooks/revenuecat", { method: "POST", body: "{}", headers: { Authorization: "Bearer hook-secret" } });
    expect(malformed.status).toBe(400);
  });

  it("returns 503 when the webhook secret is not configured", async () => {
    const h = await createHarness();
    const app = createApp(h.deps, { corsOrigins: [] });
    const res = await app.request("/webhooks/revenuecat", { method: "POST", body: "{}" });
    expect(res.status).toBe(503);
  });
});
