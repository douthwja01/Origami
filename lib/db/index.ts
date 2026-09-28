import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logIfDatabaseUnreachable } from "./connection-error";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

function getPool() {
  if (!globalForDb.pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({ connectionString: url });
    pool.on("error", (error) => {
      logIfDatabaseUnreachable(error);
    });
    globalForDb.pool = pool;
  }
  return globalForDb.pool;
}

/** Open a connection so startup can report a down database before other queries run. */
export async function pingDatabase(): Promise<void> {
  await getPool().query("select 1");
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export { schema };
export { logIfDatabaseUnreachable } from "./connection-error";
