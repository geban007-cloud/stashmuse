CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_categories_parent_sort` ON `categories` (`parent_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `digests` (
	`id` text PRIMARY KEY NOT NULL,
	`digest_date` text NOT NULL,
	`item_ids` text NOT NULL,
	`delivery_state` text DEFAULT 'queued' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_digests_date` ON `digests` (`digest_date`);--> statement-breakpoint
CREATE TABLE `saved_items` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`source_type` text DEFAULT 'favorite' NOT NULL,
	`source_key` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`cover_url` text,
	`content_type` text DEFAULT 'link' NOT NULL,
	`source_collection` text,
	`excerpt` text,
	`status` text DEFAULT 'inbox' NOT NULL,
	`availability` text DEFAULT 'available' NOT NULL,
	`category_id` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_saved_items_platform_source` ON `saved_items` (`platform`,`source_key`);--> statement-breakpoint
CREATE INDEX `idx_saved_items_status_updated` ON `saved_items` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_saved_items_category` ON `saved_items` (`category_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classification_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`category_id` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`confidence` integer NOT NULL,
	`created_at` integer NOT NULL
);
