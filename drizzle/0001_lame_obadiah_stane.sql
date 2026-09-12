CREATE TABLE `commerce_inventory_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`store` text NOT NULL,
	`order_id` text NOT NULL,
	`local_revision` integer NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_inventory_job_revision` ON `commerce_inventory_jobs` (`owner`,`store`,`order_id`,`local_revision`);--> statement-breakpoint
CREATE INDEX `commerce_inventory_pending` ON `commerce_inventory_jobs` (`owner`,`store`,`state`,`created_at`);--> statement-breakpoint
ALTER TABLE `commerce_products` ADD `erp_version` integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `inventory_mode` text DEFAULT 'standalone' NOT NULL;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `inventory_status` text DEFAULT 'LOCAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `erp_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `reservation_expires_at` text;--> statement-breakpoint
ALTER TABLE `commerce_settings` ADD `stock_integration_enabled` integer DEFAULT 0 NOT NULL;