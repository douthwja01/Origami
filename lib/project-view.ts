import { ASSET_KINDS, type AssetKind } from "@/lib/types";

export type ProjectView = "overview" | AssetKind | "nested" | "stats";

export function parseProjectView(value: string | null): ProjectView {
  if (value === "nested") return "nested";
  if (value === "stats") return "stats";
  if (value && ASSET_KINDS.includes(value as AssetKind)) {
    return value as AssetKind;
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
