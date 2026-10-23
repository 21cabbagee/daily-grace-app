import type { User } from "../db/schema";
import { effectiveTier } from "../services/billing";

/** The only user shape sent to clients. Never includes the password hash or token version. */
export function publicUser(user: User, now = new Date()) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    denomination: user.denomination,
    tier: effectiveTier(user, now),
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    streakCount: user.streakCount,
    longestStreak: user.longestStreak,
    lastDevotionDate: user.lastDevotionDate,
    timezone: user.timezone,
    remindersEnabled: user.remindersEnabled,
    reminderHour: user.reminderHour,
    reminderMinute: user.reminderMinute,
    communityNotifications: user.communityNotifications,
    onboardingCompleted: user.onboardingCompleted,
    role: user.role,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;
