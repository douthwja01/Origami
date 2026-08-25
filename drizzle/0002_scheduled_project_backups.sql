CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"backup_enabled" boolean DEFAULT false NOT NULL,
	"backup_interval_minutes" integer DEFAULT 60 NOT NULL,
	"backup_last_run_at" timestamp with time zone,
	"backup_last_summary" text
);
--> statement-breakpoint
CREATE TABLE "project_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"checksum" text NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_backup_checksum" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_backup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_backups" ADD CONSTRAINT "project_backups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_backups_project_id_idx" ON "project_backups" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_backups_created_at_idx" ON "project_backups" USING btree ("created_at");