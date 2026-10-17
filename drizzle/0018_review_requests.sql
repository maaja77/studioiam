ALTER TABLE `clients` ADD `review_asked_at` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `review_via` text DEFAULT '' NOT NULL;