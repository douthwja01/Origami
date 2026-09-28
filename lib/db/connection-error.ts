const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

const globalForDbError = globalThis as unknown as {
  origamiDatabaseUnreachableLogged?: boolean;
};

function readCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** True when a query failed because Postgres could not be reached. */
export function isDatabaseUnreachable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = readCode(error);
  if (code && UNREACHABLE_CODES.has(code)) return true;
  if (isDatabaseUnreachable((error as { cause?: unknown }).cause)) return true;
  const errors = (error as { errors?: unknown }).errors;
  return Array.isArray(errors) && errors.some((item) => isDatabaseUnreachable(item));
}

function databaseEndpoint(): { host: string; target: string } | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port || "5432";
    return { host, target: `${host}:${port}` };
  } catch {
    return null;
  }
}

export function databaseUnreachableMessage(): string {
  const endpoint = databaseEndpoint();
  const target = endpoint?.target ?? "the configured DATABASE_URL";
  const lines = [
    `[origami] Cannot connect to Postgres at ${target}.`,
    "The database service is not running.",
  ];
  const host = endpoint?.host;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    lines.push("Start Docker Desktop, then run: docker compose up db -d");
  }
  return lines.join("\n");
}

/**
 * Print one plain-language error when Postgres refused the connection.
 * Returns true when `error` was that failure, so callers can skip the query stack trace.
 */
export function logIfDatabaseUnreachable(error: unknown): boolean {
  if (!isDatabaseUnreachable(error)) return false;
  if (!globalForDbError.origamiDatabaseUnreachableLogged) {
    globalForDbError.origamiDatabaseUnreachableLogged = true;
    console.error(databaseUnreachableMessage());
  }
  return true;
}
