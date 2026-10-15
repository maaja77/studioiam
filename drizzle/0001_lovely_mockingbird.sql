CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`date` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_photos_client_date` ON `photos` (`client_id`,`date`);