ALTER TABLE `bookings` ADD `deposit_cents` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `deposit_status` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `deposit_due` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `vs` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `payment_kind` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `manage_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_manage` ON `bookings` (`manage_token`);--> statement-breakpoint
ALTER TABLE `clients` ADD `deposit_required` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `category` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `color` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `sessions` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `prepay` integer DEFAULT 0 NOT NULL;