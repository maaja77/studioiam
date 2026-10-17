ALTER TABLE `receipts` ADD `discount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `receipts` ADD `discount_label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipts` ADD `token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_token` ON `receipts` (`token`);