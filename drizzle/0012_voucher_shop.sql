ALTER TABLE `vouchers` ADD `source` text DEFAULT 'salon' NOT NULL;--> statement-breakpoint
ALTER TABLE `vouchers` ADD `buyer_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `vouchers` ADD `delivery` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `vouchers` ADD `vs` text;--> statement-breakpoint
ALTER TABLE `vouchers` ADD `pay_due` text;--> statement-breakpoint
ALTER TABLE `vouchers` ADD `token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vouchers_token` ON `vouchers` (`token`);