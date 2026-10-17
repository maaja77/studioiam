CREATE TABLE `client_programs` (
	`client_id` text NOT NULL,
	`program_id` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`client_id`, `program_id`),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`treatment` text NOT NULL,
	`price_cents` integer NOT NULL,
	`discounts` text DEFAULT '[0]' NOT NULL,
	`interval_days` integer DEFAULT 28 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `visits` ADD `program_id` text;--> statement-breakpoint
-- Program Čistá pleť (dřív pevně v aplikaci) převedený na záznam: jen v instalaci, která ho používala nebo měla zapnutý.
INSERT INTO `programs` (`id`,`name`,`treatment`,`price_cents`,`discounts`,`interval_days`,`active`,`sort`,`created`)
SELECT 'clean-skin','Čistá pleť','A-QS Hacker',129000,'[0,5,10]',28,1,0,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM `settings` WHERE `key`='booking' AND json_valid(`value`) AND json_extract(`value`,'$.programEnabled')=1)
   OR EXISTS (SELECT 1 FROM `clients` WHERE `clean_skin_active`=1)
   OR EXISTS (SELECT 1 FROM `visits` WHERE `clean_skin`=1);
--> statement-breakpoint
-- Druhý program pro stejnou instalaci: hydratační série Derma Collage (název, cenu i slevy jde změnit v Nastavení).
INSERT INTO `programs` (`id`,`name`,`treatment`,`price_cents`,`discounts`,`interval_days`,`active`,`sort`,`created`)
SELECT 'hydration','Hydratovaná pleť','Derma Collage',179000,'[0,5,10]',28,1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM `programs` WHERE `id`='clean-skin');
--> statement-breakpoint
INSERT INTO `client_programs` (`client_id`,`program_id`,`created`)
SELECT `id`,'clean-skin',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM `clients` WHERE `clean_skin_active`=1 AND EXISTS (SELECT 1 FROM `programs` WHERE `id`='clean-skin');
--> statement-breakpoint
UPDATE `visits` SET `program_id`='clean-skin' WHERE `clean_skin`=1 AND EXISTS (SELECT 1 FROM `programs` WHERE `id`='clean-skin');
