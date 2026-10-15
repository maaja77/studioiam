ALTER TABLE `clients` ADD `clean_skin_active` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `visits` ADD `clean_skin` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `visits` ADD `program_price_cents` integer;--> statement-breakpoint
ALTER TABLE `visits` ADD `program_step` integer;