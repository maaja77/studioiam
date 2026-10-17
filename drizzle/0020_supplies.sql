CREATE TABLE `service_supplies` (
	`id` text PRIMARY KEY NOT NULL,
	`service_key` text NOT NULL,
	`product_id` text NOT NULL,
	`qty` integer NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_supplies` ON `service_supplies` (`service_key`,`product_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `kind` text DEFAULT 'sale' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `pack_size` integer;