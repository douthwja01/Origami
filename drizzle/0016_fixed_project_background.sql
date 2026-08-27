CREATE TYPE "public"."media_background_mode" AS ENUM('off', 'vault', 'fixed');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "media_background_mode" "media_background_mode" DEFAULT 'off' NOT NULL;--> statement-breakpoint
UPDATE "projects" SET "media_background_mode" = CASE
  WHEN "media_background" THEN 'vault'::"media_background_mode"
  ELSE 'off'::"media_background_mode"
END;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "media_background_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_media_background_asset_id_assets_id_fk" FOREIGN KEY ("media_background_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "media_background";
