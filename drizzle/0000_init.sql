CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`blocker_id` integer NOT NULL,
	`blocked_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_pair` ON `blocks` (`blocker_id`,`blocked_id`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_user_verse` ON `bookmarks` (`user_id`,`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE TABLE `community_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`content` text NOT NULL,
	`report_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'visible' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `community_comments_post_created` ON `community_comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_likes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`post_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_likes_user_post` ON `community_likes` (`user_id`,`post_id`);--> statement-breakpoint
CREATE TABLE `community_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`reference` text,
	`like_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`report_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'visible' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `community_posts_status_created` ON `community_posts` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `community_posts_user` ON `community_posts` (`user_id`);--> statement-breakpoint
CREATE TABLE `devotionals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`reference` text NOT NULL,
	`verse_text` text NOT NULL,
	`title` text NOT NULL,
	`opening_reflection` text NOT NULL,
	`insights` text NOT NULL,
	`closing_prayer` text NOT NULL,
	`is_ai_generated` integer DEFAULT true NOT NULL,
	`model` text,
	`is_favorite` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devotionals_user_date` ON `devotionals` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `devotionals_user_created` ON `devotionals` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `highlights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`color` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `highlights_user_verse` ON `highlights` (`user_id`,`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE TABLE `prayer_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`period` text NOT NULL,
	`suggestions` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prayer_suggestions_key` ON `prayer_suggestions` (`user_id`,`date`,`period`);--> statement-breakpoint
CREATE TABLE `prayers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`is_answered` integer DEFAULT false NOT NULL,
	`answered_at` integer,
	`answer_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prayers_user_created` ON `prayers` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_unique` ON `reports` (`reporter_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `reports_status` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `scripture_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`translation` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scripture_cache_key` ON `scripture_cache` (`translation`,`book_id`,`chapter`);--> statement-breakpoint
CREATE TABLE `subscription_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`user_id` integer,
	`type` text NOT NULL,
	`product_id` text,
	`tier` text NOT NULL,
	`expires_at` integer,
	`environment` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_events_event_id_unique` ON `subscription_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `subscription_events_user` ON `subscription_events` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`denomination` text,
	`subscription_tier` text DEFAULT 'free' NOT NULL,
	`subscription_expires_at` integer,
	`streak_count` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_devotion_date` text,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`reminders_enabled` integer DEFAULT true NOT NULL,
	`reminder_hour` integer DEFAULT 6 NOT NULL,
	`reminder_minute` integer DEFAULT 0 NOT NULL,
	`community_notifications` integer DEFAULT true NOT NULL,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verse_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verse_notes_user_verse` ON `verse_notes` (`user_id`,`book_id`,`chapter`,`verse`);