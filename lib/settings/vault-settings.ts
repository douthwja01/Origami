import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { applyVaultDirOverride, vaultRoot } from "@/lib/vault/vault";
import {
  VAULT_HOST_ENV_VAR,
  vaultDirEnvVarName,
  vaultDirFromEnv,
  vaultHostDirFromEnv,
} from "@/lib/vault/vault-dir-env";

const VAULT_DIR_MAX = 4096;

export type SystemVaultSettings = {
  /** Effective vault folder as seen by this process. */
  vaultDir: string;
  /** Default from `ORIGAMI_VAULT_DIR_DEFAULT` (or legacy `ORIGAMI_VAULT_DIR`). */
  vaultDirEnvDefault: string;
  /** Env var name currently supplying that default. */
  vaultDirEnvVar: string;
  /** True when the stored value is unset and the env default applies. */
  vaultDirUsesEnvDefault: boolean;
  /** Docker host bind-mount for the env default, when set. */
  vaultHostDir: string | null;
  vaultHostEnvVar: string;
};

async function ensureSettingsRow() {
  const db = getDb();
  let [row] = await db
    .select({ vaultDir: appSettings.vaultDir })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (!row) {
    [row] = await db.insert(appSettings).values({ id: 1 }).returning({
      vaultDir: appSettings.vaultDir,
    });
  }
  return row;
}

function normalizeVaultDir(dir: string): string {
  return path.normalize(dir.trim());
}

function sameVaultDir(a: string, b: string): boolean {
  const left = normalizeVaultDir(a);
  const right = normalizeVaultDir(b);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const start = value[0];
    const end = value[value.length - 1];
    if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

export function parseVaultDir(value: unknown): string | null | false {
  if (value === null) return null;
  if (typeof value !== "string") return false;
  const dir = stripWrappingQuotes(value.trim());
  if (!dir || dir.includes("\0") || dir.length > VAULT_DIR_MAX) return false;
  if (sameVaultDir(dir, vaultDirFromEnv())) return null;
  return dir;
}

async function ensureDirectory(dir: string): Promise<void> {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) {
      throw Object.assign(new Error("Vault location must be a directory"), {
        status: 400,
      });
    }
    return;
  } catch (error) {
    if ((error as { status?: number }).status === 400) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw Object.assign(
        new Error(`Cannot use this vault location: ${(error as Error).message}`),
        { status: 400 },
      );
    }
  }

  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    throw Object.assign(
      new Error(`Cannot create vault location: ${(error as Error).message}`),
      { status: 400 },
    );
  }
}

export async function getSystemVaultSettings(): Promise<SystemVaultSettings> {
  const row = await ensureSettingsRow();
  applyVaultDirOverride(row.vaultDir);
  const vaultDirEnvDefault = vaultDirFromEnv();
  const vaultDirUsesEnvDefault = row.vaultDir == null;
  return {
    vaultDir: vaultRoot(),
    vaultDirEnvDefault,
    vaultDirEnvVar: vaultDirEnvVarName(),
    vaultDirUsesEnvDefault,
    vaultHostDir: vaultHostDirFromEnv(),
    vaultHostEnvVar: VAULT_HOST_ENV_VAR,
  };
}

export async function hydrateVaultDirFromSettings(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getSystemVaultSettings();
  } catch (error) {
    console.error("[origami] could not load vault location from settings", error);
    applyVaultDirOverride(null);
  }
}

export async function updateSystemVaultSettings(patch: {
  vaultDir?: string | null;
}): Promise<SystemVaultSettings> {
  let stored: string | null | undefined;

  if (patch.vaultDir !== undefined) {
    const parsed = parseVaultDir(patch.vaultDir);
    if (parsed === false) {
      throw Object.assign(
        new Error("Vault location must be a folder path this server can write to"),
        { status: 400 },
      );
    }
    stored = parsed;
  }

  if (stored !== undefined) {
    await ensureDirectory(stored ?? vaultDirFromEnv());
  }

  await ensureSettingsRow();
  if (stored !== undefined) {
    const db = getDb();
    await db
      .update(appSettings)
      .set({ vaultDir: stored })
      .where(eq(appSettings.id, 1));
    applyVaultDirOverride(stored);
  }

  return getSystemVaultSettings();
}
