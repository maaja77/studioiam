CREATE TABLE `voucher_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`voucher_id` text NOT NULL,
	`receipt_id` text,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_voucher_uses_voucher` ON `voucher_uses` (`voucher_id`);--> statement-breakpoint
CREATE TABLE `vouchers` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text DEFAULT 'value' NOT NULL,
	`service_name` text DEFAULT '' NOT NULL,
	`value_cents` integer NOT NULL,
	`balance_cents` integer NOT NULL,
	`buyer_name` text DEFAULT '' NOT NULL,
	`buyer_contact` text DEFAULT '' NOT NULL,
	`recipient_name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`issued` text NOT NULL,
	`valid_until` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`receipt_id` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vouchers_code` ON `vouchers` (`code`);--> statement-breakpoint
CREATE INDEX `idx_vouchers_valid` ON `vouchers` (`valid_until`);--> statement-breakpoint
ALTER TABLE `receipts` ADD `voucher_id` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `voucher_cents` integer DEFAULT 0 NOT NULL;