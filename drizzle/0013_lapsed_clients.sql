ALTER TABLE `clients` ADD `contacted_at` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `no_contact` integer DEFAULT 0 NOT NULL;