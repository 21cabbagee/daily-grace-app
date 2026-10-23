import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  denomination: text("denomination"),
  // Billing truth: written only by the RevenueCat webhook / server-side sync, never by client input.
  subscriptionTier: text("subscription_tier", { enum: ["free", "plus", "pro"] }).notNull().default("free"),
  subscriptionExpiresAt: integer("subscription_expires_at", { mode: "timestamp_ms" }),
  streakCount: integer("streak_count").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastDevotionDate: text("last_devotion_date"), // YYYY-MM-DD in the user's timezone
  timezone: text("timezone").notNull().default("America/New_York"),
  remindersEnabled: integer("reminders_enabled", { mode: "boolean" }).notNull().default(true),
  reminderHour: integer("reminder_hour").notNull().default(6),
  reminderMinute: integer("reminder_minute").notNull().default(0),
  communityNotifications: integer("community_notifications", { mode: "boolean" }).notNull().default(true),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" }).notNull().default(false),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  // Incremented to revoke every outstanding session token.
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scriptureCache = sqliteTable(
  "scripture_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    translation: text("translation").notNull(),
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    payload: text("payload").notNull(), // JSON ScriptureChapter
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("scripture_cache_key").on(t.translation, t.bookId, t.chapter)],
);

export const devotionals = sqliteTable(
  "devotionals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    reference: text("reference").notNull(),
    verseText: text("verse_text").notNull(),
    title: text("title").notNull(),
    openingReflection: text("opening_reflection").notNull(),
    insights: text("insights", { mode: "json" }).$type<{ heading: string; body: string }[]>().notNull(),
    closingPrayer: text("closing_prayer").notNull(),
    isAiGenerated: integer("is_ai_generated", { mode: "boolean" }).notNull().default(true),
    model: text("model"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("devotionals_user_date").on(t.userId, t.date), index("devotionals_user_created").on(t.userId, t.createdAt)],
);

export const prayers = sqliteTable(
  "prayers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: text("category", { enum: ["praise", "petition", "intercession", "thanksgiving"] }).notNull(),
    isAnswered: integer("is_answered", { mode: "boolean" }).notNull().default(false),
    answeredAt: integer("answered_at", { mode: "timestamp_ms" }),
    answerNote: text("answer_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("prayers_user_created").on(t.userId, t.createdAt)],
);

export const prayerSuggestions = sqliteTable(
  "prayer_suggestions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    period: text("period", { enum: ["morning", "afternoon", "evening"] }).notNull(),
    suggestions: text("suggestions", { mode: "json" }).$type<{ topic: string; prompt: string }[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("prayer_suggestions_key").on(t.userId, t.date, t.period)],
);

const verseKeyColumns = {
  bookId: text("book_id").notNull(),
  chapter: integer("chapter").notNull(),
  verse: integer("verse").notNull(),
};

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...verseKeyColumns,
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("bookmarks_user_verse").on(t.userId, t.bookId, t.chapter, t.verse)],
);

export const highlights = sqliteTable(
  "highlights",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...verseKeyColumns,
    color: text("color", { enum: ["yellow", "green", "blue", "pink"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("highlights_user_verse").on(t.userId, t.bookId, t.chapter, t.verse)],
);

export const verseNotes = sqliteTable(
  "verse_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...verseKeyColumns,
    content: text("content").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("verse_notes_user_verse").on(t.userId, t.bookId, t.chapter, t.verse)],
);

export const communityPosts = sqliteTable(
  "community_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["verse_reaction", "prayer_request"] }).notNull(),
    content: text("content").notNull(),
    reference: text("reference"),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    reportCount: integer("report_count").notNull().default(0),
    status: text("status", { enum: ["visible", "hidden", "removed"] }).notNull().default("visible"),
    createdAt: createdAt(),
  },
  (t) => [index("community_posts_status_created").on(t.status, t.createdAt), index("community_posts_user").on(t.userId)],
);

export const communityLikes = sqliteTable(
  "community_likes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("community_likes_user_post").on(t.userId, t.postId)],
);

export const communityComments = sqliteTable(
  "community_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    reportCount: integer("report_count").notNull().default(0),
    status: text("status", { enum: ["visible", "hidden", "removed"] }).notNull().default("visible"),
    createdAt: createdAt(),
  },
  (t) => [index("community_comments_post_created").on(t.postId, t.createdAt)],
);

export const reports = sqliteTable(
  "reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reporterId: integer("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["post", "comment"] }).notNull(),
    targetId: integer("target_id").notNull(),
    reason: text("reason", {
      enum: ["spam", "harassment", "inappropriate", "false_teaching", "self_harm", "other"],
    }).notNull(),
    details: text("details"),
    status: text("status", { enum: ["open", "actioned", "dismissed"] }).notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_unique").on(t.reporterId, t.targetType, t.targetId),
    index("reports_status").on(t.status, t.createdAt),
  ],
);

export const blocks = sqliteTable(
  "blocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    blockerId: integer("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: integer("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("blocks_pair").on(t.blockerId, t.blockedId)],
);

// Audit log of verified RevenueCat webhook events. Idempotent on eventId.
export const subscriptionEvents = sqliteTable(
  "subscription_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id").notNull().unique(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    productId: text("product_id"),
    tier: text("tier", { enum: ["free", "plus", "pro"] }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    environment: text("environment"),
    createdAt: createdAt(),
  },
  (t) => [index("subscription_events_user").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Devotional = typeof devotionals.$inferSelect;
export type Prayer = typeof prayers.$inferSelect;
