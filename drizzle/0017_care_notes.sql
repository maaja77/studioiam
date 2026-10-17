CREATE TABLE `care_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`client_id` text NOT NULL,
	`token` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`products` text DEFAULT '[]' NOT NULL,
	`sent_at` text,
	`sent_via` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_notes_visit` ON `care_notes` (`visit_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_notes_token` ON `care_notes` (`token`);