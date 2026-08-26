ALTER TABLE "projects" ADD COLUMN "media_background" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "media_background_cycle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "media_background_opacity" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
UPDATE "projects" SET
  "media_background" = COALESCE((SELECT "media_background" FROM "app_settings" WHERE "id" = 1), false),
  "media_background_cycle" = COALESCE((SELECT "media_background_cycle" FROM "app_settings" WHERE "id" = 1), false),
  "media_background_opacity" = COALESCE((SELECT "media_background_opacity" FROM "app_settings" WHERE "id" = 1), 25);--> statement-breakpoint
ALTER TABLE "app_settings" DROP COLUMN "media_background";--> statement-breakpoint
ALTER TABLE "app_settings" DROP COLUMN "media_background_cycle";--> statement-breakpoint
ALTER TABLE "app_settings" DROP COLUMN "media_background_opacity";