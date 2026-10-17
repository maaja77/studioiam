CREATE TABLE `stock_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`delta` integer NOT NULL,
	`stock_after` integer,
	`receipt_id` text,
	`note` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stock_moves_product` ON `stock_moves` (`product_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_stock_moves_receipt` ON `stock_moves` (`receipt_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `stock` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `min_stock` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `cost_cents` integer;