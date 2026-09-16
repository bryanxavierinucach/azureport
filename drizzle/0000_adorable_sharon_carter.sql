CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`work_item_id` integer NOT NULL,
	`work_date` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`seconds` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_time_entries_user_date` ON `time_entries` (`user_id`,`work_date`);
--> statement-breakpoint
PRAGMA optimize;
