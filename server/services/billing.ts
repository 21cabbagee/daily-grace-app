import { eq } from "drizzle-orm";
import { ENTITLEMENTS, type SubscriptionTier } from "../../shared/constants";
import type { Db } from "../db/client";
import { subscriptionEvents, users, type User } from "../db/schema";

/** Tier the user is entitled to right now (an expired subscription counts as free). */
export function effectiveTier(user: Pick<User, "subscriptionTier" | "subscriptionExpiresAt">, now = new Date()): SubscriptionTier {
  if (user.subscriptionTier === "free") return "free";
  if (user.subscriptionExpiresAt && user.subscriptionExpiresAt.getTime() <= now.getTime()) return "free";
  return user.subscriptionTier;
}

export interface Entitlement {
  tier: SubscriptionTier;
  expiresAt: Date | null;
}

/** Highest active tier from a set of RevenueCat entitlement ids. */
export function tierFromEntitlementIds(ids: readonly string[]): SubscriptionTier {
  if (ids.includes(ENTITLEMENTS.pro)) return "pro";
  if (ids.includes(ENTITLEMENTS.plus)) return "plus";
  return "free";
}

export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  environment?: string | null;
  transferred_to?: string[] | null;
  transferred_from?: string[] | null;
}

const GRANTING = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"]);
const REVOKING = new Set(["EXPIRATION"]);

/** Entitlement implied by one webhook event, or null when the event does not change access. */
export function entitlementFromEvent(event: RevenueCatEvent): Entitlement | null {
  if (REVOKING.has(event.type)) return { tier: "free", expiresAt: null };
  if (GRANTING.has(event.type) || event.type === "CANCELLATION") {
    // CANCELLATION keeps access until the period ends, so we record the same expiry.
    const tier = tierFromEntitlementIds(event.entitlement_ids ?? []);
    return { tier, expiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : null };
  }
  return null;
}

/** Server-side lookup against RevenueCat's REST API: the source of truth for entitlements. */
export async function fetchRevenueCatEntitlement(appUserId: string, secretKey: string, fetchFn: typeof fetch = fetch): Promise<Entitlement> {
  const res = await fetchFn(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`RevenueCat returned ${res.status}`);
  const body = (await res.json()) as {
    subscriber: { entitlements: Record<string, { expires_date: string | null }> };
  };
  const now = Date.now();
  let best: Entitlement = { tier: "free", expiresAt: null };
  for (const [id, ent] of Object.entries(body.subscriber.entitlements ?? {})) {
    const expires = ent.expires_date ? new Date(ent.expires_date) : null;
    if (expires && expires.getTime() <= now) continue;
    const tier = tierFromEntitlementIds([id]);
    if (tier === "pro" || (tier === "plus" && best.tier === "free")) best = { tier, expiresAt: expires };
  }
  return best;
}

export function parseAppUserId(appUserId: string): number | null {
  return /^\d+$/.test(appUserId) ? Number(appUserId) : null;
}

export async function applyEntitlement(db: Db, userId: number, ent: Entitlement) {
  await db.update(users).set({ subscriptionTier: ent.tier, subscriptionExpiresAt: ent.expiresAt }).where(eq(users.id, userId));
}

/** Idempotently records a webhook event and updates the user's entitlement. */
export async function handleRevenueCatEvent(
  db: Db,
  event: RevenueCatEvent,
  opts: { secretKey?: string; fetchFn?: typeof fetch } = {},
): Promise<"processed" | "duplicate" | "ignored"> {
  const existing = await db.query.subscriptionEvents.findFirst({ where: eq(subscriptionEvents.eventId, event.id) });
  if (existing) return "duplicate";

  const affected = new Set<string>([event.app_user_id, ...(event.transferred_to ?? []), ...(event.transferred_from ?? [])]);
  let recordedTier: SubscriptionTier = "free";
  let recordedUserId: number | null = null;
  let changed = false;

  for (const appUserId of affected) {
    const userId = parseAppUserId(appUserId);
    if (userId == null) continue;
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) continue;

    let ent: Entitlement | null;
    if (opts.secretKey) {
      ent = await fetchRevenueCatEntitlement(appUserId, opts.secretKey, opts.fetchFn);
    } else {
      ent = appUserId === event.app_user_id ? entitlementFromEvent(event) : null;
    }
    if (!ent) continue;
    await applyEntitlement(db, userId, ent);
    changed = true;
    if (appUserId === event.app_user_id) {
      recordedTier = ent.tier;
      recordedUserId = userId;
    }
  }

  await db.insert(subscriptionEvents).values({
    eventId: event.id,
    userId: recordedUserId,
    type: event.type,
    productId: event.product_id ?? null,
    tier: recordedTier,
    expiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
    environment: event.environment ?? null,
  });
  return changed ? "processed" : "ignored";
}
