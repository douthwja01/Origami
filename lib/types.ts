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
  githubUrl: string | null;
  websiteUrl: string | null;
  mediaBackground: boolean;
  mediaBackgroundCycle: boolean;
  mediaBackgroundOpacity: number;
  createdAt: string;
  updatedAt: string;
  childCount: number;
  assetCount: number;
  assetsByKind: Record<AssetKind, number>;
};

export type TagDTO = {
  id: string;
  projectId: string;
  name: string;
  key: string;
  required: boolean;
  createdAt: string;
};

export type AssetDTO = {
  id: string;
  projectId: string;
  kind: AssetKind;
  folderPath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string | null;
  createdAt: string;
  tags: TagDTO[];
};

export type FolderDTO = {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
  tags: TagDTO[];
};

export type ProjectTreeNode = ProjectDTO & { children: ProjectTreeNode[] };

export type ProjectDetail = {
  project: ProjectDTO;
  ancestors: ProjectDTO[];
  children: ProjectDTO[];
  assets: AssetDTO[];
  folders: FolderDTO[];
  tags: TagDTO[];
};

export function isStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && STATUSES.includes(value as ProjectStatus);
}

export function isKind(value: unknown): value is AssetKind {
  return typeof value === "string" && ASSET_KINDS.includes(value as AssetKind);
}
