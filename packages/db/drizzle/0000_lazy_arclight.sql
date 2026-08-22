CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`abs_path` text NOT NULL,
	`git_remote` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text,
	`provider_session_id` text,
	`permission_mode` text NOT NULL,
	`worktree_path` text,
	`status` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`role` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_session_seq_idx` ON `events` (`session_id`,`seq`);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`error` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text,
	`auth_mode` text NOT NULL,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`wake_word` text,
	`stt_provider` text NOT NULL,
	`tts_provider` text NOT NULL,
	`voice_id` text,
	`speed` real DEFAULT 1 NOT NULL,
	`language` text NOT NULL,
	`persona_prompt` text DEFAULT '' NOT NULL,
	`verbosity` text NOT NULL,
	`interrupt_on_speech` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL
);
