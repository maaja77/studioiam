CREATE TABLE `visit_products` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`product_id` text,
	`name` text NOT NULL,
	`amount` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_visit_products_visit` ON `visit_products` (`visit_id`);--> statement-breakpoint
CREATE INDEX `idx_visit_products_name` ON `visit_products` (`name`);