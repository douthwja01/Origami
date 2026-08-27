import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { maxUploadMbFromEnv } from "@/lib/upload-limit-env";

export type SystemUploadSettings = {
  /** Effective per-file upload limit in megabytes. */
  maxUploadMb: number;
  /** Default from `ORIGAMI_MAX_UPLOAD_MB` when nothing is stored in the database. */
  envDefaultMb: number;
  /** Maximum value allowed in settings (same as env default / ops ceiling). */
  ceilingMb: number;
  /** True when the stored value is unset and the env default applies. */
  usesEnvDefault: boolean;
};

async function ensureSettingsRow() {
  const db = getDb();
  let [row] = await db
    .select({ maxUploadMb: appSettings.maxUploadMb })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (!row) {
    [row] = await db.insert(appSettings).values({ id: 1 }).returning({
      maxUploadMb: appSettings.maxUploadMb,
    });
  }
  return row;
}

export function parseMaxUploadMb(
  value: unknown,
  ceiling: number,
): number | null {
  if (value === null) return null;
  const mb = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(mb) || !Number.isInteger(mb) || mb < 1) {
    return null;
  }
  if (mb > ceiling) return null;
  return mb;
}

export async function getSystemUploadSettings(): Promise<SystemUploadSettings> {
  const row = await ensureSettingsRow();
  const envDefaultMb = maxUploadMbFromEnv();
  const usesEnvDefault = row.maxUploadMb == null;
  const maxUploadMb = usesEnvDefault ? envDefaultMb : row.maxUploadMb!;
  return {
    maxUploadMb,
    envDefaultMb,
    ceilingMb: envDefaultMb,
    usesEnvDefault,
  };
}

export async function updateSystemUploadSettings(patch: {
  maxUploadMb?: number | null;
}): Promise<SystemUploadSettings> {
  const ceiling = maxUploadMbFromEnv();
  let stored: number | null | undefined;

  if (patch.maxUploadMb !== undefined) {
    if (patch.maxUploadMb === null) {
      stored = null;
    } else {
      const parsed = parseMaxUploadMb(patch.maxUploadMb, ceiling);
      if (parsed === null) {
        throw Object.assign(
          new Error(`Upload limit must be a whole number from 1 to ${ceiling} MB`),
          { status: 400 },
        );
      }
      stored = parsed;
    }
  }

  await ensureSettingsRow();
  const db = getDb();
  await db
    .update(appSettings)
    .set({
      ...(stored !== undefined ? { maxUploadMb: stored } : {}),
    })
    .where(eq(appSettings.id, 1));

  return getSystemUploadSettings();
}

export async function resolveMaxUploadMb(): Promise<number> {
  const settings = await getSystemUploadSettings();
  return settings.maxUploadMb;
}

export async function resolveMaxUploadBytes(): Promise<number> {
  return (await resolveMaxUploadMb()) * 1024 * 1024;
}

export function maxUploadBytesFromMb(mb: number): number {
  return mb * 1024 * 1024;
}
