CREATE TABLE `action_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`digest_id` text,
	`title` text NOT NULL,
	`steps` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_action_plans_item` ON `action_plans` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_action_plans_updated` ON `action_plans` (`updated_at`);--> statement-breakpoint
CREATE TABLE `retention_events` (
	`id` text PRIMARY KEY NOT NULL,
	`digest_id` text NOT NULL,
	`item_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_retention_events_digest_item` ON `retention_events` (`digest_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_retention_events_item_created` ON `retention_events` (`item_id`,`created_at`);