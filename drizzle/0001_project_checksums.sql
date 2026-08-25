ALTER TABLE "assets" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "checksum_at" timestamp with time zone;