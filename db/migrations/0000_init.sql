CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text,
	`name` text DEFAULT 'default' NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`quota_usd` real,
	`spent_usd` real DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`ip_whitelist` text,
	`model_whitelist` text,
	`requires_signing` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_uq` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_user_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`decision_note` text,
	`decided_by` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`actor_ip` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta` text,
	`prev_hash` text,
	`hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_time_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `balances` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`available` real DEFAULT 0 NOT NULL,
	`frozen` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balances_scope_uq` ON `balances` (`scope`);--> statement-breakpoint
CREATE TABLE `content_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`api_key_id` text,
	`request_id` text,
	`public_model` text,
	`rule` text NOT NULL,
	`excerpt_hash` text,
	`excerpt_masked` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_id` text,
	`review_note` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `flags_status_idx` ON `content_flags` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`balance_after` real NOT NULL,
	`request_id` text,
	`memo` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_scope_time_idx` ON `ledger_entries` (`scope`,`created_at`);--> statement-breakpoint
CREATE TABLE `model_pricing` (
	`id` text PRIMARY KEY NOT NULL,
	`public_name` text NOT NULL,
	`input_per_million` real NOT NULL,
	`output_per_million` real NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_name_uq` ON `model_pricing` (`public_name`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`public_name` text NOT NULL,
	`provider_id` text NOT NULL,
	`upstream_model` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`cost_weight` real DEFAULT 1 NOT NULL,
	`max_context` integer,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `models_public_idx` ON `models` (`public_name`);--> statement-breakpoint
CREATE TABLE `org_members` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_member_uq` ON `org_members` (`org_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`billing_mode` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`label` text DEFAULT 'default' NOT NULL,
	`encrypted_key` text NOT NULL,
	`key_fingerprint` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `provider_keys_provider_idx` ON `provider_keys` (`provider_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`kind` text DEFAULT 'openai_compat' NOT NULL,
	`base_url` text NOT NULL,
	`auth_scheme` text DEFAULT 'bearer' NOT NULL,
	`extra_headers` text,
	`status` text DEFAULT 'active' NOT NULL,
	`authorization_ref` text,
	`authorization_expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limit_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`window` text NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`api_key_id` text,
	`org_id` text,
	`public_model` text NOT NULL,
	`provider_id` text,
	`upstream_model` text,
	`status` text NOT NULL,
	`http_status` integer,
	`latency_ms` integer,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`stream` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`attempts` integer DEFAULT 1 NOT NULL,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_user_time_idx` ON `usage_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_key_time_idx` ON `usage_logs` (`api_key_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`tos_accepted_at` integer,
	`privacy_accepted_at` integer,
	`step_up_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);