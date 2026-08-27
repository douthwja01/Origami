import {
  PROJECT_ASSET_KINDS,
  type ProjectAssetKind,
} from "@/lib/types";

export type ProjectView =
  | "overview"
  | ProjectAssetKind
  | "folds"
  | "stats";

export function parseProjectView(value: string | null): ProjectView {
  if (value === "folds" || value === "nested") return "folds";
  if (value === "stats") return "stats";
  if (
    value &&
    (PROJECT_ASSET_KINDS as readonly string[]).includes(value)
  ) {
    return value as ProjectAssetKind;
  }
  return "overview";
}

export function projectViewHref(projectId: string, view: ProjectView = "overview") {
  if (view === "overview") return `/projects/${projectId}`;
  return `/projects/${projectId}?view=${view}`;
}

export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)$/);
  return match?.[1] ?? null;
}
