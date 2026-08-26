import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import {
  DEFAULT_VAULT_NAME,
  parseVaultName,
  type ProjectDisplaySettings,
} from "@/lib/project-settings-types";

export type { ProjectDisplaySettings } from "@/lib/project-settings-types";
export {
  DEFAULT_MEDIA_BACKGROUND_OPACITY,
  DEFAULT_PROJECT_DISPLAY_SETTINGS,
  DEFAULT_VAULT_NAME,
  MEDIA_BACKGROUND_CYCLE_MS,
  MEDIA_BACKGROUND_OPACITY_MAX,
  MEDIA_BACKGROUND_OPACITY_MIN,
  VAULT_NAME_MAX,
  clampMediaBackgroundOpacity,
  isMediaBackgroundOpacity,
  parseVaultName,
} from "@/lib/project-settings-types";

async function ensureSettingsRow() {
  const db = getDb();
  let [row] = await db
    .select({
      vaultName: appSettings.vaultName,
    })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (!row) {
    [row] = await db.insert(appSettings).values({ id: 1 }).returning({
      vaultName: appSettings.vaultName,
    });
  }
  return row;
}

export async function getProjectDisplaySettings(): Promise<ProjectDisplaySettings> {
  const row = await ensureSettingsRow();
  return {
    vaultName: parseVaultName(row.vaultName) ?? DEFAULT_VAULT_NAME,
  };
}

export async function updateProjectDisplaySettings(patch: {
  vaultName?: string;
}): Promise<ProjectDisplaySettings> {
  await ensureSettingsRow();
  const db = getDb();
  await db
    .update(appSettings)
    .set({
      ...(patch.vaultName !== undefined ? { vaultName: patch.vaultName } : {}),
    })
    .where(eq(appSettings.id, 1));
  return getProjectDisplaySettings();
}
