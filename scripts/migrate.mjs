import { readFileSync } from "node:fs";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  try {
    const text = readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional when the environment is already set (Docker).
  }
}

loadDotEnv();

export async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const retries = 30;
  for (let i = 0; i < retries; i += 1) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.end();
      break;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (i === retries - 1) {
        throw error;
      }
      console.log(`Waiting for database... (${i + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  // Ensure the enum value exists when the type is already present (upgrades).
  // Fresh installs get it from migration 0017 inside migrate().
  const typeCheck = await client.query(
    `SELECT 1 FROM pg_type WHERE typname = 'asset_kind'`,
  );
  if (typeCheck.rowCount) {
    await client.query(
      `ALTER TYPE "public"."asset_kind" ADD VALUE IF NOT EXISTS 'backup'`,
    );
  }

  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "..", "drizzle"),
  });

  // Retag archives only after the ADD VALUE transaction has committed.
  await client.query(`
    UPDATE "assets"
    SET "kind" = 'backup'
    WHERE lower("filename") LIKE '%.zip'
       OR lower("filename") LIKE '%.rar'
       OR lower("filename") LIKE '%.7z'
       OR lower("filename") LIKE '%.tar'
       OR lower("filename") LIKE '%.tgz'
       OR lower("filename") LIKE '%.gz'
       OR lower("filename") LIKE '%.tar.gz'
  `);
  await client.query(`
    INSERT INTO "tags" ("project_id", "name", "key", "required")
    SELECT p."id", 'Backup', 'backup', true
    FROM "projects" p
    ON CONFLICT ("project_id", "key") DO UPDATE SET
      "required" = true,
      "name" = EXCLUDED."name"
  `);
  await client.query(`
    DELETE FROM "asset_tags" AS at
    USING "assets" AS a, "tags" AS t
    WHERE at."asset_id" = a."id"
      AND at."tag_id" = t."id"
      AND t."key" IN ('media', 'code', 'document', 'cad', 'backup')
      AND t."key" <> a."kind"::text
  `);
  await client.query(`
    INSERT INTO "asset_tags" ("asset_id", "tag_id")
    SELECT a."id", t."id"
    FROM "assets" a
    INNER JOIN "tags" t
      ON t."project_id" = a."project_id"
      AND t."key" = a."kind"::text
    ON CONFLICT DO NOTHING
  `);

  // Collapse legacy "documents" keys created from label "Documents"
  // (canonical kind key is "document").
  await client.query(`
    INSERT INTO "asset_tags" ("asset_id", "tag_id")
    SELECT at."asset_id", canon."id"
    FROM "asset_tags" at
    INNER JOIN "tags" dup ON dup."id" = at."tag_id" AND dup."key" = 'documents'
    INNER JOIN "tags" canon
      ON canon."project_id" = dup."project_id" AND canon."key" = 'document'
    ON CONFLICT DO NOTHING
  `);
  await client.query(`
    INSERT INTO "folder_tags" ("folder_id", "tag_id")
    SELECT ft."folder_id", canon."id"
    FROM "folder_tags" ft
    INNER JOIN "tags" dup ON dup."id" = ft."tag_id" AND dup."key" = 'documents'
    INNER JOIN "tags" canon
      ON canon."project_id" = dup."project_id" AND canon."key" = 'document'
    ON CONFLICT DO NOTHING
  `);
  await client.query(`DELETE FROM "tags" WHERE "key" = 'documents'`);

  await client.end();
  console.log("Migrations complete");
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  runMigrations().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
