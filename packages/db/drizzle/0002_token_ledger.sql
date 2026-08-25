CREATE TABLE `token_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text NOT NULL,
	`run_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text,
	`cost_model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd_micros` integer,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `token_ledger_run_id_idx` ON `token_ledger` (`run_id`);--> statement-breakpoint
CREATE INDEX `token_ledger_workspace_ts_idx` ON `token_ledger` (`workspace_id`,`ts`);--> statement-breakpoint
CREATE INDEX `token_ledger_session_ts_idx` ON `token_ledger` (`session_id`,`ts`);--> statement-breakpoint
CREATE INDEX `token_ledger_ts_idx` ON `token_ledger` (`ts`);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `token_ledger_no_update` BEFORE UPDATE ON `token_ledger`
BEGIN
	SELECT RAISE(ABORT, 'token_ledger is append-only');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `token_ledger_no_delete` BEFORE DELETE ON `token_ledger`
BEGIN
	SELECT RAISE(ABORT, 'token_ledger is append-only');
END;
