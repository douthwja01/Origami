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
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "..", "drizzle"),
  });
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
