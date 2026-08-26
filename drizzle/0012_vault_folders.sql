CREATE TABLE "project_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_folders_unique_path" UNIQUE("project_id","kind","path")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "folder_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_folders_project_id_idx" ON "project_folders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_folders_lookup_idx" ON "project_folders" USING btree ("project_id","kind","path");--> statement-breakpoint
CREATE INDEX "assets_project_kind_folder_idx" ON "assets" USING btree ("project_id","kind","folder_path");