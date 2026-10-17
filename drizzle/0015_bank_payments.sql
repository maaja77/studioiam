CREATE TABLE `bank_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`vs` text DEFAULT '' NOT NULL,
	`account` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`operation` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unmatched' NOT NULL,
	`match_kind` text,
	`match_id` text,
	`match_label` text DEFAULT '' NOT NULL,
	`imported` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bank_payments_date` ON `bank_payments` (`date`);--> statement-breakpoint
CREATE INDEX `idx_bank_payments_status` ON `bank_payments` (`status`);