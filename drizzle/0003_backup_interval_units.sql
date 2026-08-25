ALTER TABLE "app_settings" ADD COLUMN "backup_interval_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "backup_interval_unit" text DEFAULT 'week' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" DROP COLUMN "backup_interval_minutes";
