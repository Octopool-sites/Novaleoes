CREATE TABLE IF NOT EXISTS `commerce_products` (
	`owner` text NOT NULL,
	`store` text NOT NULL,
	`id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`category` text NOT NULL,
	`price_cents` integer NOT NULL,
	`stock` integer NOT NULL,
	`image` text NOT NULL,
	`description` text NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner`, `store`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `commerce_product_sku` ON `commerce_products` (`owner`,`store`,`sku`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `commerce_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`store` text NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `commerce_events_order` ON `commerce_order_events` (`owner`,`store`,`order_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `commerce_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`store` text NOT NULL,
	`idempotency` text NOT NULL,
	`fingerprint` text NOT NULL,
	`number` text NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`vehicle` text NOT NULL,
	`note` text NOT NULL,
	`items_json` text NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `commerce_order_idempotency` ON `commerce_orders` (`owner`,`store`,`idempotency`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `commerce_orders_owner_date` ON `commerce_orders` (`owner`,`store`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `commerce_settings` (
	`owner` text NOT NULL,
	`store` text NOT NULL,
	`erp_access_enabled` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `store`)
);
