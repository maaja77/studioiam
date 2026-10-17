CREATE TABLE `intake_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`booking_id` text,
	`token` text NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`answers` text,
	`birth_date` text DEFAULT '' NOT NULL,
	`consent_health` integer DEFAULT 0 NOT NULL,
	`consent_photos` integer DEFAULT 0 NOT NULL,
	`signed_name` text DEFAULT '' NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`consent_text` text DEFAULT '' NOT NULL,
	`submitted_at` text,
	`submitted_ip` text DEFAULT '' NOT NULL,
	`withdrawn_at` text,
	`created` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_intake_token` ON `intake_forms` (`token`);--> statement-breakpoint
CREATE INDEX `idx_intake_client` ON `intake_forms` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_intake_booking` ON `intake_forms` (`booking_id`);