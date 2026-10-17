CREATE TABLE `absences` (
	`id` text PRIMARY KEY NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_absences_start` ON `absences` (`start_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `photos` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `vip` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `deposit_cents` integer;--> statement-breakpoint
ALTER TABLE `services` ADD `pause_min` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `weekdays` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `photo` integer DEFAULT 0 NOT NULL;