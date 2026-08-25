ALTER TABLE "app_settings" ADD COLUMN "backup_retention_count" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "backup_retention_unit" text DEFAULT 'week' NOT NULL;
