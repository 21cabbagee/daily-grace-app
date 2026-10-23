import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import type { SubscriptionTier } from "../../shared/constants";

// RevenueCat runs only in native development/production builds. In Expo Go and on web the
// native module is missing, so every call resolves to "unavailable" instead of crashing.

type PurchasesModule = typeof import("react-native-purchases").default;

const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

let mod: PurchasesModule | null = null;
let configured = false;

function load(): PurchasesModule | null {
  if (configured) return mod;
  configured = true;
  if (Platform.OS === "web" || !apiKey || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-purchases").default as PurchasesModule;
    mod.configure({ apiKey });
  } catch {
    mod = null;
  }
  return mod;
}

export interface PlanPackage {
  tier: Exclude<SubscriptionTier, "free">;
  priceString: string;
  pkg: PurchasesPackage;
}

export const purchases = {
  isAvailable(): boolean {
    return load() !== null;
  },

  async logIn(appUserId: string) {
    await load()?.logIn(appUserId);
  },

  async logOut() {
    const m = load();
    if (m && !(await m.isAnonymous())) await m.logOut();
  },

  /**
   * Packages from the current RevenueCat offering. Package identifiers must be
   * "grace_plus_monthly" and "grace_pro_monthly" (see DEPLOYMENT.md).
   */
  async getPackages(): Promise<PlanPackage[]> {
    const m = load();
    if (!m) return [];
    const offerings = await m.getOfferings();
    const result: PlanPackage[] = [];
    for (const pkg of offerings.current?.availablePackages ?? []) {
      if (pkg.identifier === "grace_plus_monthly") result.push({ tier: "plus", priceString: pkg.product.priceString, pkg });
      if (pkg.identifier === "grace_pro_monthly") result.push({ tier: "pro", priceString: pkg.product.priceString, pkg });
    }
    return result;
  },

  /** Returns false if the user cancelled. Entitlement is confirmed server-side afterwards. */
  async purchase(pkg: PurchasesPackage): Promise<boolean> {
    const m = load();
    if (!m) throw new Error("Purchases are not available in this build.");
    try {
      await m.purchasePackage(pkg);
      return true;
    } catch (err) {
      if ((err as { userCancelled?: boolean }).userCancelled) return false;
      throw err;
    }
  },

  async restore(): Promise<void> {
    const m = load();
    if (!m) throw new Error("Purchases are not available in this build.");
    await m.restorePurchases();
  },
};
