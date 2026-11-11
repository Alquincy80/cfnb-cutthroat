CREATE TABLE `voice_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`from_client` text NOT NULL,
	`to_client` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL
);
