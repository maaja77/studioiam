CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`seq` integer NOT NULL,
	`number` text NOT NULL,
	`booking_id` text,
	`client_id` text,
	`client_name` text DEFAULT '' NOT NULL,
	`issued` text NOT NULL,
	`items` text NOT NULL,
	`total_cents` integer NOT NULL,
	`prepaid_cents` integer DEFAULT 0 NOT NULL,
	`due_cents` integer NOT NULL,
	`method` text NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`vs` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_number` ON `receipts` (`number`);--> statement-breakpoint
CREATE INDEX `idx_receipts_issued` ON `receipts` (`issued`);--> statement-breakpoint
CREATE INDEX `idx_receipts_booking` ON `receipts` (`booking_id`);