ALTER TABLE `clients` ADD `unreliable` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `deposit_rule` text DEFAULT '' NOT NULL;