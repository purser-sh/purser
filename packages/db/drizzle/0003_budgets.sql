CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text,
	`window` text NOT NULL,
	`limit_usd_micros` integer,
	`limit_tokens` integer,
	`action` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
