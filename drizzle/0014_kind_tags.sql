ALTER TABLE "tags" ADD COLUMN "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "tags" ("project_id", "name", "key", "required")
SELECT p."id", v.name, v.key, true
FROM "projects" p
CROSS JOIN (
	VALUES
		('Media', 'media'),
		('Code', 'code'),
		('Documents', 'document'),
		('CAD', 'cad')
) AS v(name, key)
ON CONFLICT ("project_id", "key") DO UPDATE SET
	"required" = true,
	"name" = EXCLUDED."name";--> statement-breakpoint
INSERT INTO "asset_tags" ("asset_id", "tag_id")
SELECT a."id", t."id"
FROM "assets" a
INNER JOIN "tags" t ON t."project_id" = a."project_id" AND t."key" = a."kind"::text
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "folder_tags" AS ft
SET "folder_id" = keeper."id"
FROM "project_folders" AS dupe
INNER JOIN "project_folders" AS keeper
	ON keeper."project_id" = dupe."project_id"
	AND keeper."path" = dupe."path"
	AND keeper."id" <> dupe."id"
	AND (keeper."created_at" < dupe."created_at" OR (keeper."created_at" = dupe."created_at" AND keeper."id" < dupe."id"))
WHERE ft."folder_id" = dupe."id"
	AND NOT EXISTS (
		SELECT 1 FROM "folder_tags" AS existing
		WHERE existing."folder_id" = keeper."id" AND existing."tag_id" = ft."tag_id"
	);--> statement-breakpoint
DELETE FROM "folder_tags"
WHERE "folder_id" IN (
	SELECT dupe."id"
	FROM "project_folders" AS dupe
	INNER JOIN "project_folders" AS keeper
		ON keeper."project_id" = dupe."project_id"
		AND keeper."path" = dupe."path"
		AND keeper."id" <> dupe."id"
		AND (keeper."created_at" < dupe."created_at" OR (keeper."created_at" = dupe."created_at" AND keeper."id" < dupe."id"))
);--> statement-breakpoint
DELETE FROM "project_folders"
WHERE "id" IN (
	SELECT dupe."id"
	FROM "project_folders" AS dupe
	INNER JOIN "project_folders" AS keeper
		ON keeper."project_id" = dupe."project_id"
		AND keeper."path" = dupe."path"
		AND keeper."id" <> dupe."id"
		AND (keeper."created_at" < dupe."created_at" OR (keeper."created_at" = dupe."created_at" AND keeper."id" < dupe."id"))
);--> statement-breakpoint
DROP INDEX "assets_project_kind_folder_idx";--> statement-breakpoint
DROP INDEX "project_folders_lookup_idx";--> statement-breakpoint
CREATE INDEX "assets_project_folder_idx" ON "assets" USING btree ("project_id","folder_path");--> statement-breakpoint
ALTER TABLE "project_folders" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_unique_path" UNIQUE("project_id","path");
