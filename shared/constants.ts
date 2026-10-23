export const SUBSCRIPTION_TIERS = ["free", "plus", "pro"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export interface PlanInfo {
  tier: SubscriptionTier;
  name: string;
  priceLabel: string;
  features: string[];
}

export const PLANS: readonly PlanInfo[] = [
  {
    tier: "free",
    name: "Free",
    priceLabel: "$0",
    features: ["3 AI devotionals per week", "Bible reader", "Prayer journal", "Read the community feed"],
  },
  {
    tier: "plus",
    name: "Grace Plus",
    priceLabel: "$4.99/month",
    features: ["Unlimited AI devotionals", "AI prayer suggestions", "Unlimited highlights & notes", "Devotional history"],
  },
  {
    tier: "pro",
    name: "Grace Pro",
    priceLabel: "$9.99/month",
    features: ["Everything in Grace Plus", "Post and comment in the community", "Priority access to new features"],
  },
];

/** AI devotionals a free user may generate per rolling 7 days. */
export const FREE_WEEKLY_DEVOTIONALS = 3;

/** RevenueCat entitlement identifiers. Configure the same ids in the RevenueCat dashboard. */
export const ENTITLEMENTS = { plus: "grace_plus", pro: "grace_pro" } as const;

export const tierRank: Record<SubscriptionTier, number> = { free: 0, plus: 1, pro: 2 };
export function hasTier(current: SubscriptionTier, required: SubscriptionTier): boolean {
  return tierRank[current] >= tierRank[required];
}

export const PRAYER_CATEGORIES = ["praise", "petition", "intercession", "thanksgiving"] as const;
export type PrayerCategory = (typeof PRAYER_CATEGORIES)[number];
export const PRAYER_CATEGORY_LABELS: Record<PrayerCategory, string> = {
  praise: "Praise",
  petition: "Petition",
  intercession: "Intercession",
  thanksgiving: "Thanksgiving",
};

export const DENOMINATIONS = [
  "Non-denominational",
  "Baptist",
  "Methodist",
  "Pentecostal",
  "Presbyterian",
  "Lutheran",
  "Anglican / Episcopal",
  "Assemblies of God",
  "Church of Christ",
  "Evangelical Free",
  "Reformed",
  "Other",
  "Prefer not to say",
] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const POST_TYPES = ["verse_reaction", "prayer_request"] as const;
export type PostType = (typeof POST_TYPES)[number];

export const REPORT_REASONS = ["spam", "harassment", "inappropriate", "false_teaching", "self_harm", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Posts or comments reaching this many distinct reports are hidden pending review. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

export const LIMITS = {
  prayerContent: 2000,
  postContent: 1000,
  commentContent: 500,
  noteContent: 2000,
  situation: 280,
  name: 80,
  passwordMin: 8,
} as const;

export const CRISIS_RESOURCES =
  "If you are in crisis or thinking about harming yourself, please call or text 988 (Suicide & Crisis Lifeline, US) or dial 911 in an emergency.";

/** Minimum plan required to create community posts and comments (reading and liking is open to all signed-in users). */
export const COMMUNITY_POST_TIER: SubscriptionTier = "pro";
/** Minimum plan required for AI prayer-topic suggestions. */
export const PRAYER_SUGGESTION_TIER: SubscriptionTier = "plus";
/** Highlights and verse notes a free user may keep (each); paid plans are unlimited. */
export const FREE_ANNOTATION_LIMIT = 25;
