export const DEFAULT_VAULT_NAME = "Workshop";
export const VAULT_NAME_MAX = 80;
export const DEFAULT_MEDIA_BACKGROUND_OPACITY = 25;
export const MEDIA_BACKGROUND_CYCLE_MS = 12_000;
export const MEDIA_BACKGROUND_OPACITY_MIN = 0;
export const MEDIA_BACKGROUND_OPACITY_MAX = 100;

export type ProjectDisplaySettings = {
  vaultName: string;
};

export const DEFAULT_PROJECT_DISPLAY_SETTINGS: ProjectDisplaySettings = {
  vaultName: DEFAULT_VAULT_NAME,
};

export function parseVaultName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > VAULT_NAME_MAX) return null;
  return name;
}

export function isMediaBackgroundOpacity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MEDIA_BACKGROUND_OPACITY_MIN &&
    value <= MEDIA_BACKGROUND_OPACITY_MAX
  );
}

export function clampMediaBackgroundOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MEDIA_BACKGROUND_OPACITY;
  return Math.min(
    MEDIA_BACKGROUND_OPACITY_MAX,
    Math.max(MEDIA_BACKGROUND_OPACITY_MIN, Math.round(value)),
  );
}
