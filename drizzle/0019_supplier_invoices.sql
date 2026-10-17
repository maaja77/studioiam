CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`product_id` text,
	`name` text NOT NULL,
	`qty` integer NOT NULL,
	`unit_cost_cents` integer,
	`stocked` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier` text NOT NULL,
	`number` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`due` text,
	`total_cents` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`file_key` text,
	`file_mime` text,
	`file_name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_invoices_date` ON `invoices` (`date`);--> statement-breakpoint
ALTER TABLE `stock_moves` ADD `invoice_id` text;