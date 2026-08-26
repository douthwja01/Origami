CREATE TABLE "asset_tags" (
	"asset_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "asset_tags_asset_id_tag_id_pk" PRIMARY KEY("asset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "folder_tags" (
	"folder_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "folder_tags_folder_id_tag_id_pk" PRIMARY KEY("folder_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_project_key_unique" UNIQUE("project_id","key")
);
--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_tags" ADD CONSTRAINT "folder_tags_folder_id_project_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."project_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_tags" ADD CONSTRAINT "folder_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_tags_tag_id_idx" ON "asset_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "folder_tags_tag_id_idx" ON "folder_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tags_project_id_idx" ON "tags" USING btree ("project_id");