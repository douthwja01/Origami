export const PROJECT_HIDDEN_ROOT = ".origami";
export const PROJECT_BACKGROUND_FOLDER = ".origami/background";

export const MEDIA_BACKGROUND_MODES = ["off", "vault", "fixed"] as const;
export type MediaBackgroundMode = (typeof MEDIA_BACKGROUND_MODES)[number];

export function isMediaBackgroundMode(value: unknown): value is MediaBackgroundMode {
  return (
    typeof value === "string" &&
    (MEDIA_BACKGROUND_MODES as readonly string[]).includes(value)
  );
}

export function isHiddenFolderPath(path: string): boolean {
  return (
    path === PROJECT_HIDDEN_ROOT ||
    path.startsWith(`${PROJECT_HIDDEN_ROOT}/`)
  );
}
