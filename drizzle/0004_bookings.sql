CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text,
	`client_id` text,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`service_name` text DEFAULT '' NOT NULL,
	`price_cents` integer,
	`name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`source` text DEFAULT 'online' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_start` ON `bookings` (`start_at`);--> statement-breakpoint
CREATE INDEX `idx_bookings_client` ON `bookings` (`client_id`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`duration_min` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `blocked` integer DEFAULT 0 NOT NULL;