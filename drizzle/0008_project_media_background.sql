ALTER TABLE "app_settings" ADD COLUMN "media_background" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "media_background_cycle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "media_background_opacity" integer DEFAULT 25 NOT NULL;