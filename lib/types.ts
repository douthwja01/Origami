export type ProjectStatus =
  | "planned"
  | "active"
  | "on_hold"
  | "done"
  | "archived";

export type AssetKind = "media" | "code" | "document" | "cad";

export const STATUSES: ProjectStatus[] = [
  "planned",
  "active",
  "on_hold",
  "done",
  "archived",
];

export const BOARD_STATUSES: ProjectStatus[] = [
  "planned",
  "active",
  "on_hold",
  "done",
];

export const ASSET_KINDS: AssetKind[] = ["media", "code", "document", "cad"];

export type ProjectDTO = {
  id: string;
  code: string;
  title: string;
  startDate: string;
  status: ProjectStatus;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  childCount: number;
  assetCount: number;
  assetsByKind: Record<AssetKind, number>;
};

export type AssetDTO = {
  id: string;
  projectId: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ProjectTreeNode = ProjectDTO & { children: ProjectTreeNode[] };

export type ProjectDetail = {
  project: ProjectDTO;
  ancestors: ProjectDTO[];
  children: ProjectDTO[];
  assets: AssetDTO[];
};

export function isStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && STATUSES.includes(value as ProjectStatus);
}

export function isKind(value: unknown): value is AssetKind {
  return typeof value === "string" && ASSET_KINDS.includes(value as AssetKind);
}
