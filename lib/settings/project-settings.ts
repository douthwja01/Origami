import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import {
  DEFAULT_VAULT_LOGO_URL,
  DEFAULT_VAULT_NAME,
  parseVaultName,
  type ProjectDisplaySettings,
} from "@/lib/settings/project-settings-types";
import { removeVaultFile, safeFilename } from "@/lib/vault/vault";

export type { ProjectDisplaySettings } from "@/lib/settings/project-settings-types";
export {
  DEFAULT_MEDIA_BACKGROUND_OPACITY,
  DEFAULT_PROJECT_DISPLAY_SETTINGS,
  DEFAULT_VAULT_LOGO_URL,
  DEFAULT_VAULT_NAME,
  MEDIA_BACKGROUND_CYCLE_MS,
  MEDIA_BACKGROUND_CROSSFADE_MS,
  MEDIA_BACKGROUND_OPACITY_MAX,
  MEDIA_BACKGROUND_OPACITY_MIN,
  VAULT_NAME_MAX,
  clampMediaBackgroundOpacity,
  isMediaBackgroundMode,
  isMediaBackgroundOpacity,
  isHiddenFolderPath,
  MEDIA_BACKGROUND_MODES,
  PROJECT_BACKGROUND_FOLDER,
  PROJECT_HIDDEN_ROOT,
  parseVaultName,
} from "@/lib/settings/project-settings-types";

type SettingsLogoRow = {
  vaultName: string;
  vaultLogoPath: string | null;
  vaultLogoMime: string | null;
  vaultLogoHash: string | null;
};

function logoUrlFromRow(row: SettingsLogoRow): {
  vaultLogoUrl: string;
  hasCustomVaultLogo: boolean;
} {
  if (row.vaultLogoPath) {
    const hash = row.vaultLogoHash ? `?v=${row.vaultLogoHash.slice(0, 12)}` : "";
    return {
      vaultLogoUrl: `/api/settings/projects/logo${hash}`,
      hasCustomVaultLogo: true,
    };
  }
  return {
    vaultLogoUrl: DEFAULT_VAULT_LOGO_URL,
    hasCustomVaultLogo: false,
  };
}

function toDisplaySettings(row: SettingsLogoRow): ProjectDisplaySettings {
  const logo = logoUrlFromRow(row);
  return {
    vaultName: parseVaultName(row.vaultName) ?? DEFAULT_VAULT_NAME,
    vaultLogoUrl: logo.vaultLogoUrl,
    hasCustomVaultLogo: logo.hasCustomVaultLogo,
  };
}

async function ensureSettingsRow(): Promise<SettingsLogoRow> {
  const db = getDb();
  let [row] = await db
    .select({
      vaultName: appSettings.vaultName,
      vaultLogoPath: appSettings.vaultLogoPath,
      vaultLogoMime: appSettings.vaultLogoMime,
      vaultLogoHash: appSettings.vaultLogoHash,
    })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (!row) {
    [row] = await db.insert(appSettings).values({ id: 1 }).returning({
      vaultName: appSettings.vaultName,
      vaultLogoPath: appSettings.vaultLogoPath,
      vaultLogoMime: appSettings.vaultLogoMime,
      vaultLogoHash: appSettings.vaultLogoHash,
    });
  }
  return row;
}

export async function getProjectDisplaySettings(): Promise<ProjectDisplaySettings> {
  const row = await ensureSettingsRow();
  return toDisplaySettings(row);
}

export async function getVaultLogoRecord(): Promise<{
  storagePath: string;
  mimeType: string;
  hash: string | null;
} | null> {
  const row = await ensureSettingsRow();
  if (!row.vaultLogoPath) return null;
  return {
    storagePath: row.vaultLogoPath,
    mimeType: row.vaultLogoMime || "application/octet-stream",
    hash: row.vaultLogoHash,
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

function logoFilename(originalName: string): string {
  const safe = safeFilename(originalName);
  const ext = safe.includes(".") ? safe.slice(safe.lastIndexOf(".")) : "";
  return `logo${ext || ".png"}`;
}

export async function setVaultLogo(input: {
  mimeType: string;
  storagePath: string;
  contentHash: string;
}): Promise<ProjectDisplaySettings> {
  const row = await ensureSettingsRow();
  const previousPath = row.vaultLogoPath;

  const db = getDb();
  await db
    .update(appSettings)
    .set({
      vaultLogoPath: input.storagePath,
      vaultLogoMime: input.mimeType,
      vaultLogoHash: input.contentHash,
    })
    .where(eq(appSettings.id, 1));

  if (previousPath && previousPath !== input.storagePath) {
    await removeVaultFile(previousPath).catch(() => undefined);
  }

  return getProjectDisplaySettings();
}

export async function clearVaultLogo(): Promise<ProjectDisplaySettings> {
  const row = await ensureSettingsRow();
  const previousPath = row.vaultLogoPath;

  const db = getDb();
  await db
    .update(appSettings)
    .set({
      vaultLogoPath: null,
      vaultLogoMime: null,
      vaultLogoHash: null,
    })
    .where(eq(appSettings.id, 1));

  if (previousPath) {
    await removeVaultFile(previousPath).catch(() => undefined);
  }

  return getProjectDisplaySettings();
}

export { logoFilename };
