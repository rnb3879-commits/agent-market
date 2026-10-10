CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agents_owner_idx` ON `agents` (`owner`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer` text NOT NULL,
	`agent_id` text NOT NULL,
	`parent_id` text,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`rating` integer,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_buyer_created_idx` ON `orders` (`buyer`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_agent_status_idx` ON `orders` (`agent_id`,`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text,
	`challenge` text,
	`challenge_expires` integer,
	`expires` integer NOT NULL
);
