import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { backupArchivedProject } from "@/lib/backup";
import { getDb } from "@/lib/db";
import { assets, projectFolders, projects } from "@/lib/db/schema";
import {
  isUnderFolderPath,
  joinFolderPath,
  normalizeFolderPath,
  parseFolderName,
} from "@/lib/folder-path";
import {
  isHiddenFolderPath,
  PROJECT_BACKGROUND_FOLDER,
  type MediaBackgroundMode,
} from "@/lib/project-background";
import {
  formatRootProjectCode,
  nextChildCode,
} from "@/lib/project-code";
import { inferKind, isPreviewableImage, mimeFromFilename } from "@/lib/kinds";
import { tagsForAssets, tagsForFolders, assignRequiredKindTag, setAssetTags } from "@/lib/tags";
import { isKindTagKey } from "@/lib/tag-utils";
import type {
  AssetDTO,
  AssetKind,
  FolderDTO,
  ProjectDTO,
  ProjectStatus,
  TagDTO,
} from "@/lib/types";
import {
  removeProjectVault,
  removeVaultFile,
  renameVaultFile,
  safeFilename,
} from "@/lib/vault";

function emptyKinds(): Record<AssetKind, number> {
  return { media: 0, code: 0, document: 0, cad: 0, backup: 0 };
}

export function toProjectDTO(
  row: typeof projects.$inferSelect,
  childCount: number,
  assetsByKind: Record<AssetKind, number>,
  thumbnailAssetId: string | null = null,
): ProjectDTO {
  const assetCount = Object.values(assetsByKind).reduce((a, b) => a + b, 0);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    startDate: row.startDate,
    status: row.status,
    parentId: row.parentId,
    githubUrl: row.githubUrl,
    websiteUrl: row.websiteUrl,
    mediaBackgroundMode: row.mediaBackgroundMode,
    mediaBackgroundAssetId: row.mediaBackgroundAssetId,
    mediaBackgroundCycle: row.mediaBackgroundCycle,
    mediaBackgroundOpacity: row.mediaBackgroundOpacity,
    thumbnailAssetId: thumbnailAssetId ?? row.mediaBackgroundAssetId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    childCount,
    assetCount,
    assetsByKind,
  };
}

export function toAssetDTO(
  row: typeof assets.$inferSelect,
  itemTags: TagDTO[] = [],
): AssetDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    folderPath: row.folderPath ?? "",
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
    tags: itemTags,
  };
}

export function toFolderDTO(
  row: typeof projectFolders.$inferSelect,
  itemTags: TagDTO[] = [],
): FolderDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    path: row.path,
    createdAt: row.createdAt.toISOString(),
    tags: itemTags,
  };
}

export async function listProjects(): Promise<ProjectDTO[]> {
  const db = getDb();
  const rows = await db.select().from(projects).orderBy(asc(projects.code));
  const assetRows = await db
    .select({
      projectId: assets.projectId,
      kind: assets.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(assets)
    .groupBy(assets.projectId, assets.kind);

  const kindMap = new Map<string, Record<AssetKind, number>>();
  for (const row of assetRows) {
    const current = kindMap.get(row.projectId) ?? emptyKinds();
    current[row.kind] = Number(row.count);
    kindMap.set(row.projectId, current);
  }

  const childMap = new Map<string, number>();
  for (const row of rows) {
    if (row.parentId) {
      childMap.set(row.parentId, (childMap.get(row.parentId) ?? 0) + 1);
    }
  }

  const thumbnailMap = await loadThumbnailAssetIds(
    rows.map((row) => ({
      id: row.id,
      mediaBackgroundAssetId: row.mediaBackgroundAssetId,
    })),
  );

  return rows.map((row) =>
    toProjectDTO(
      row,
      childMap.get(row.id) ?? 0,
      kindMap.get(row.id) ?? emptyKinds(),
      thumbnailMap.get(row.id) ?? null,
    ),
  );
}

async function loadThumbnailAssetIds(
  projectRows: { id: string; mediaBackgroundAssetId: string | null }[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const row of projectRows) {
    map.set(row.id, null);
  }
  if (projectRows.length === 0) return map;

  const projectIds = projectRows.map((row) => row.id);
  const preferredIds = projectRows
    .map((row) => row.mediaBackgroundAssetId)
    .filter((id): id is string => Boolean(id));

  const preferred =
    preferredIds.length === 0
      ? []
      : await getDb()
          .select({
            id: assets.id,
            projectId: assets.projectId,
            mimeType: assets.mimeType,
            filename: assets.filename,
          })
          .from(assets)
          .where(inArray(assets.id, preferredIds));

  for (const row of preferred) {
    if (isPreviewableImage(row.mimeType, row.filename)) {
      map.set(row.projectId, row.id);
    }
  }

  const missing = projectIds.filter((id) => !map.get(id));
  if (missing.length === 0) return map;

  const imageRows = await getDb()
    .select({
      id: assets.id,
      projectId: assets.projectId,
      folderPath: assets.folderPath,
      mimeType: assets.mimeType,
      filename: assets.filename,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .where(and(inArray(assets.projectId, missing), eq(assets.kind, "media")))
    .orderBy(sql`${assets.createdAt} desc`);

  for (const row of imageRows) {
    if (map.get(row.projectId)) continue;
    if (isHiddenFolderPath(row.folderPath)) continue;
    if (!isPreviewableImage(row.mimeType, row.filename)) continue;
    map.set(row.projectId, row.id);
  }

  return map;
}

export async function getProjectRow(id: string) {
  const db = getDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function getProjectByCode(code: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.code, code))
    .limit(1);
  return row ?? null;
}

export async function getProjectByTitle(
  title: string,
  excludeId?: string | null,
) {
  const db = getDb();
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;
  const conditions = [sql`lower(${projects.title}) = ${normalized}`];
  if (excludeId) conditions.push(ne(projects.id, excludeId));
  const [row] = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

export function parseOptionalHttpUrl(
  value: unknown,
  label: string,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw Object.assign(new Error(`${label} must be a string`), { status: 400 });
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw Object.assign(new Error(`${label} is not a valid URL`), { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error(`${label} must be an http(s) URL`), {
      status: 400,
    });
  }
  return parsed.href;
}

export async function nextProjectCode(parentId?: string | null): Promise<string> {
  if (parentId) {
    const parent = await getProjectRow(parentId);
    if (!parent) {
      throw Object.assign(new Error("Parent project not found"), { status: 400 });
    }
    const db = getDb();
    const siblings = await db
      .select({ code: projects.code })
      .from(projects)
      .where(eq(projects.parentId, parentId));
    return nextChildCode(
      parent.code,
      siblings.map((row) => row.code),
    );
  }

  const db = getDb();
  const result = await db.execute(
    sql`select nextval('project_code_seq') as n`,
  );
  const n = Number(
    (result.rows[0] as { n: string | number } | undefined)?.n ?? 1,
  );
  return formatRootProjectCode(n);
}

export async function createProject(input: {
  title: string;
  startDate: string;
  status: ProjectStatus;
  parentId: string | null;
  code?: string;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}): Promise<ProjectDTO> {
  const db = getDb();
  if (input.parentId) {
    const parent = await getProjectRow(input.parentId);
    if (!parent) {
      throw Object.assign(new Error("Parent project not found"), { status: 400 });
    }
  }
  const code = input.code?.trim() || (await nextProjectCode(input.parentId));
  const existing = await getProjectByCode(code);
  if (existing) {
    throw Object.assign(new Error("Project ID already exists"), { status: 409 });
  }
  const titleClash = await getProjectByTitle(input.title);
  if (titleClash) {
    throw Object.assign(new Error("Project name already exists"), { status: 409 });
  }
  const [row] = await db
    .insert(projects)
    .values({
      code,
      title: input.title.trim(),
      startDate: input.startDate,
      status: input.status,
      parentId: input.parentId,
      githubUrl: input.githubUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
    })
    .returning();
  if (row.status === "archived") {
    await backupArchivedProject(row);
  }
  return toProjectDTO(row, 0, emptyKinds());
}

export async function wouldCreateCycle(
  projectId: string,
  newParentId: string | null,
): Promise<boolean> {
  if (!newParentId) return false;
  if (newParentId === projectId) return true;
  const db = getDb();
  let current: string | null = newParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === projectId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    const [row] = await db
      .select({ parentId: projects.parentId })
      .from(projects)
      .where(eq(projects.id, current))
      .limit(1);
    current = row?.parentId ?? null;
  }
  return false;
}

export async function updateProject(
  id: string,
  patch: {
    title?: string;
    startDate?: string;
    status?: ProjectStatus;
    parentId?: string | null;
    code?: string;
    githubUrl?: string | null;
    websiteUrl?: string | null;
    mediaBackgroundMode?: MediaBackgroundMode;
    mediaBackgroundAssetId?: string | null;
    mediaBackgroundCycle?: boolean;
    mediaBackgroundOpacity?: number;
  },
): Promise<ProjectDTO> {
  const db = getDb();
  const existing = await getProjectRow(id);
  if (!existing) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }
  if (patch.code && patch.code !== existing.code) {
    const clash = await getProjectByCode(patch.code);
    if (clash) {
      throw Object.assign(new Error("Project ID already exists"), { status: 409 });
    }
  }
  if (patch.title !== undefined) {
    const titleClash = await getProjectByTitle(patch.title, id);
    if (titleClash) {
      throw Object.assign(new Error("Project name already exists"), {
        status: 409,
      });
    }
  }
  if (patch.parentId !== undefined) {
    if (await wouldCreateCycle(id, patch.parentId)) {
      throw Object.assign(
        new Error("Cannot move a project under itself or a descendant"),
        { status: 400 },
      );
    }
    if (patch.parentId) {
      const parent = await getProjectRow(patch.parentId);
      if (!parent) {
        throw Object.assign(new Error("Parent project not found"), { status: 400 });
      }
    }
  }

  const [row] = await db
    .update(projects)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
      ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
      ...(patch.githubUrl !== undefined ? { githubUrl: patch.githubUrl } : {}),
      ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl } : {}),
      ...(patch.mediaBackgroundMode !== undefined
        ? { mediaBackgroundMode: patch.mediaBackgroundMode }
        : {}),
      ...(patch.mediaBackgroundAssetId !== undefined
        ? { mediaBackgroundAssetId: patch.mediaBackgroundAssetId }
        : {}),
      ...(patch.mediaBackgroundCycle !== undefined
        ? { mediaBackgroundCycle: patch.mediaBackgroundCycle }
        : {}),
      ...(patch.mediaBackgroundOpacity !== undefined
        ? { mediaBackgroundOpacity: patch.mediaBackgroundOpacity }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  if (existing.status !== "archived" && row.status === "archived") {
    await backupArchivedProject(row);
  }

  const all = await listProjects();
  const dto = all.find((p) => p.id === row.id);
  if (!dto) {
    throw new Error("Failed to load updated project");
  }
  return dto;
}

export async function descendantIds(rootId: string): Promise<string[]> {
  const all = await getDb().select({ id: projects.id, parentId: projects.parentId }).from(projects);
  const children = new Map<string, string[]>();
  for (const row of all) {
    if (row.parentId) {
      const list = children.get(row.parentId) ?? [];
      list.push(row.id);
      children.set(row.parentId, list);
    }
  }
  const out: string[] = [];
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export async function deleteProject(id: string, cascade: boolean): Promise<void> {
  const db = getDb();
  const existing = await getProjectRow(id);
  if (!existing) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }

  const kids = await descendantIds(id);
  if (!cascade && kids.length > 0) {
    throw Object.assign(
      new Error("Project has nested projects. Pass cascade=1 to delete them too."),
      { status: 409 },
    );
  }

  const ids = cascade ? [id, ...kids] : [id];

  if (!cascade) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assets)
      .where(eq(assets.projectId, id));
    if (Number(count) > 0) {
      throw Object.assign(
        new Error("Project has files. Pass cascade=1 to delete them too."),
        { status: 409 },
      );
    }
  }

  await db.delete(assets).where(inArray(assets.projectId, ids));

  for (const pid of ids) {
    await removeProjectVault(pid);
  }

  const ordered = [...kids].reverse();
  ordered.push(id);
  for (const pid of ordered) {
    await db.delete(projects).where(eq(projects.id, pid));
  }
}

export async function ensureProjectFolder(
  projectId: string,
  fullPath: string,
): Promise<void> {
  const normalized = normalizeFolderPath(fullPath);
  if (!normalized) {
    throw Object.assign(new Error("Invalid folder path"), { status: 400 });
  }
  const db = getDb();
  const parts = normalized.split("/");
  let built = "";
  for (const part of parts) {
    built = joinFolderPath(built, part);
    const [existing] = await db
      .select({ id: projectFolders.id })
      .from(projectFolders)
      .where(
        and(
          eq(projectFolders.projectId, projectId),
          eq(projectFolders.path, built),
        ),
      )
      .limit(1);
    if (!existing) {
      await db.insert(projectFolders).values({ projectId, path: built });
    }
  }
}

export async function listBackgroundFolderAssets(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.projectId, projectId),
        eq(assets.folderPath, PROJECT_BACKGROUND_FOLDER),
      ),
    );
}

export async function clearBackgroundFolderAssets(projectId: string): Promise<void> {
  const rows = await listBackgroundFolderAssets(projectId);
  for (const row of rows) {
    await removeVaultFile(row.storagePath).catch(() => undefined);
    await deleteBackgroundAssetRow(row.id, row.projectId);
  }
}

async function deleteBackgroundAssetRow(id: string, projectId: string) {
  const db = getDb();
  await db
    .update(projects)
    .set({ mediaBackgroundAssetId: null })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.mediaBackgroundAssetId, id),
      ),
    );
  await db.delete(assets).where(eq(assets.id, id));
}

export async function listAssets(projectId: string, kind?: AssetKind) {
  const db = getDb();
  const rows = kind
    ? await db
        .select()
        .from(assets)
        .where(and(eq(assets.projectId, projectId), eq(assets.kind, kind)))
        .orderBy(asc(assets.filename))
    : await db
        .select()
        .from(assets)
        .where(eq(assets.projectId, projectId))
        .orderBy(asc(assets.filename));
  const tagMap = await tagsForAssets(rows.map((row) => row.id));
  return rows.map((row) => toAssetDTO(row, tagMap.get(row.id) ?? []));
}

export async function listFolders(projectId: string): Promise<FolderDTO[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId))
    .orderBy(asc(projectFolders.path));
  const tagMap = await tagsForFolders(rows.map((row) => row.id));
  return rows.map((row) => toFolderDTO(row, tagMap.get(row.id) ?? []));
}

export async function getAsset(id: string) {
  const db = getDb();
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return row ?? null;
}

export async function insertAsset(input: {
  id?: string;
  projectId: string;
  kind: AssetKind;
  folderPath?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  contentHash: string;
  reservedFolder?: boolean;
}) {
  const db = getDb();
  const folderPath = normalizeFolderPath(input.folderPath ?? "");
  if (folderPath === null) {
    throw Object.assign(new Error("Invalid folder path"), { status: 400 });
  }
  if (!input.reservedFolder && isHiddenFolderPath(folderPath)) {
    throw Object.assign(new Error("That folder is reserved"), { status: 403 });
  }
  const { reservedFolder: _reserved, ...values } = input;
  const [row] = await db
    .insert(assets)
    .values({ ...values, folderPath })
    .returning();
  const itemTags = await assignRequiredKindTag(row.id, row.projectId, row.kind);
  return toAssetDTO(row, itemTags);
}

export async function updateAsset(
  id: string,
  patch: { kind?: AssetKind; folderPath?: string; filename?: string },
): Promise<AssetDTO> {
  const existing = await getAsset(id);
  if (!existing) {
    throw Object.assign(new Error("Asset not found"), { status: 404 });
  }
  let folderPath: string | undefined;
  if (patch.folderPath !== undefined) {
    const parsed = normalizeFolderPath(patch.folderPath);
    if (parsed === null) {
      throw Object.assign(new Error("Invalid folder path"), { status: 400 });
    }
    if (isHiddenFolderPath(parsed)) {
      throw Object.assign(new Error("That folder is reserved"), { status: 403 });
    }
    folderPath = parsed;
  }

  let filename: string | undefined;
  let storagePath: string | undefined;
  let mimeType: string | undefined;
  let kind = patch.kind;
  if (patch.filename !== undefined) {
    const raw = patch.filename.trim();
    if (!raw || /[\\/]/.test(raw)) {
      throw Object.assign(new Error("Enter a file name without path separators"), {
        status: 400,
      });
    }
    const nextName = safeFilename(raw);
    if (nextName !== existing.filename) {
      const targetFolder = folderPath ?? existing.folderPath;
      const db = getDb();
      const [clash] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(
          and(
            eq(assets.projectId, existing.projectId),
            eq(assets.folderPath, targetFolder),
            eq(assets.filename, nextName),
            ne(assets.id, id),
          ),
        )
        .limit(1);
      if (clash) {
        throw Object.assign(
          new Error("A file with that name already exists here"),
          { status: 409 },
        );
      }
      const siblingFolder = joinFolderPath(targetFolder, nextName);
      const [folderClash] = await db
        .select({ id: projectFolders.id })
        .from(projectFolders)
        .where(
          and(
            eq(projectFolders.projectId, existing.projectId),
            eq(projectFolders.path, siblingFolder),
          ),
        )
        .limit(1);
      if (folderClash) {
        throw Object.assign(
          new Error("A folder with that name already exists here"),
          { status: 409 },
        );
      }
      storagePath = await renameVaultFile(
        existing.storagePath,
        nextName,
      );
      filename = nextName;
      mimeType = mimeFromFilename(nextName);
      if (kind === undefined) {
        kind = inferKind(nextName);
      }
    }
  }

  try {
    const [row] = await getDb()
      .update(assets)
      .set({
        ...(kind !== undefined ? { kind } : {}),
        ...(folderPath !== undefined ? { folderPath } : {}),
        ...(filename !== undefined ? { filename } : {}),
        ...(storagePath !== undefined ? { storagePath } : {}),
        ...(mimeType !== undefined ? { mimeType } : {}),
      })
      .where(eq(assets.id, id))
      .returning();
    const tagMap = await tagsForAssets([row.id]);
    let itemTags = tagMap.get(row.id) ?? [];
    if (kind !== undefined && kind !== existing.kind) {
      const extra = itemTags
        .filter((tag) => !tag.required && !isKindTagKey(tag.key))
        .map((tag) => tag.name);
      itemTags = await setAssetTags(id, existing.projectId, extra);
    }
    return toAssetDTO(row, itemTags);
  } catch (error) {
    if (storagePath && filename) {
      await renameVaultFile(storagePath, existing.filename).catch(() => undefined);
    }
    throw error;
  }
}

export async function createFolder(input: {
  projectId: string;
  parentPath: string;
  name: string;
}): Promise<FolderDTO> {
  const parent = normalizeFolderPath(input.parentPath);
  const name = parseFolderName(input.name);
  if (parent === null) {
    throw Object.assign(new Error("Invalid parent folder"), { status: 400 });
  }
  if (!name) {
    throw Object.assign(new Error("Enter a valid folder name"), { status: 400 });
  }
  const path = joinFolderPath(parent, name);
  if (isHiddenFolderPath(path)) {
    throw Object.assign(new Error("That folder is reserved"), { status: 403 });
  }
  const db = getDb();

  const [existingFolder] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(
      and(
        eq(projectFolders.projectId, input.projectId),
        eq(projectFolders.path, path),
      ),
    )
    .limit(1);
  if (existingFolder) {
    throw Object.assign(new Error("Folder already exists"), { status: 409 });
  }

  const [clash] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(
        eq(assets.projectId, input.projectId),
        eq(assets.folderPath, parent),
        eq(assets.filename, name),
      ),
    )
    .limit(1);
  if (clash) {
    throw Object.assign(
      new Error("A file with that name already exists here"),
      { status: 409 },
    );
  }

  const [row] = await db
    .insert(projectFolders)
    .values({
      projectId: input.projectId,
      path,
    })
    .returning();
  return toFolderDTO(row, []);
}

export async function deleteFolder(
  projectId: string,
  path: string,
): Promise<{ deletedAssets: number; deletedFolders: number }> {
  const normalized = normalizeFolderPath(path);
  if (!normalized) {
    throw Object.assign(new Error("Cannot delete the root folder"), {
      status: 400,
    });
  }
  if (isHiddenFolderPath(normalized)) {
    throw Object.assign(new Error("That folder is reserved"), { status: 403 });
  }

  const db = getDb();
  const assetRows = await db
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId));
  const assetsInFolder = assetRows.filter(
    (row) =>
      row.folderPath === normalized ||
      isUnderFolderPath(row.folderPath, normalized),
  );

  for (const row of assetsInFolder) {
    await removeVaultFile(row.storagePath).catch(() => undefined);
  }
  if (assetsInFolder.length > 0) {
    await db.delete(assets).where(
      inArray(
        assets.id,
        assetsInFolder.map((row) => row.id),
      ),
    );
  }

  const folderRows = await db
    .select()
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId));
  const foldersInPath = folderRows.filter(
    (row) =>
      row.path === normalized || isUnderFolderPath(row.path, normalized),
  );
  if (foldersInPath.length > 0) {
    await db.delete(projectFolders).where(
      inArray(
        projectFolders.id,
        foldersInPath.map((row) => row.id),
      ),
    );
  }

  return {
    deletedAssets: assetsInFolder.length,
    deletedFolders: foldersInPath.length,
  };
}

function rewriteFolderPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (isUnderFolderPath(path, from)) return `${to}${path.slice(from.length)}`;
  return path;
}

export async function renameFolder(
  projectId: string,
  path: string,
  name: string,
): Promise<FolderDTO> {
  const normalized = normalizeFolderPath(path);
  if (!normalized) {
    throw Object.assign(new Error("Cannot rename the root folder"), {
      status: 400,
    });
  }
  if (isHiddenFolderPath(normalized)) {
    throw Object.assign(new Error("That folder is reserved"), { status: 403 });
  }

  const nextName = parseFolderName(name);
  if (!nextName) {
    throw Object.assign(new Error("Enter a valid folder name"), { status: 400 });
  }

  const parts = normalized.split("/");
  const parent = parts.slice(0, -1).join("/");
  const newPath = joinFolderPath(parent, nextName);
  if (isHiddenFolderPath(newPath)) {
    throw Object.assign(new Error("That folder is reserved"), { status: 403 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(projectFolders)
    .where(
      and(
        eq(projectFolders.projectId, projectId),
        eq(projectFolders.path, normalized),
      ),
    )
    .limit(1);

  if (newPath === normalized) {
    if (existing) {
      const tagMap = await tagsForFolders([existing.id]);
      return toFolderDTO(existing, tagMap.get(existing.id) ?? []);
    }
    await ensureProjectFolder(projectId, normalized);
    const [row] = await db
      .select()
      .from(projectFolders)
      .where(
        and(
          eq(projectFolders.projectId, projectId),
          eq(projectFolders.path, normalized),
        ),
      )
      .limit(1);
    return toFolderDTO(row!, []);
  }

  const [folderClash] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(
      and(
        eq(projectFolders.projectId, projectId),
        eq(projectFolders.path, newPath),
      ),
    )
    .limit(1);
  if (folderClash) {
    throw Object.assign(new Error("Folder already exists"), { status: 409 });
  }

  const [fileClash] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(
        eq(assets.projectId, projectId),
        eq(assets.folderPath, parent),
        eq(assets.filename, nextName),
      ),
    )
    .limit(1);
  if (fileClash) {
    throw Object.assign(
      new Error("A file with that name already exists here"),
      { status: 409 },
    );
  }

  // Also treat asset-only folder paths as clashes (no projectFolders row yet).
  const assetFolderRows = await db
    .select({ folderPath: assets.folderPath })
    .from(assets)
    .where(eq(assets.projectId, projectId));
  const conflictingAssetFolder = assetFolderRows.some((row) => {
    const underOld =
      row.folderPath === normalized ||
      isUnderFolderPath(row.folderPath, normalized);
    if (underOld) return false;
    return (
      row.folderPath === newPath || isUnderFolderPath(row.folderPath, newPath)
    );
  });
  if (conflictingAssetFolder) {
    throw Object.assign(new Error("Folder already exists"), { status: 409 });
  }

  const folderRows = await db
    .select()
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId));
  const foldersToRewrite = folderRows
    .filter(
      (row) =>
        row.path === normalized || isUnderFolderPath(row.path, normalized),
    )
    .sort((a, b) => b.path.length - a.path.length);

  for (const row of foldersToRewrite) {
    const nextPath = rewriteFolderPath(row.path, normalized, newPath);
    if (nextPath === row.path) continue;
    await db
      .update(projectFolders)
      .set({ path: nextPath })
      .where(eq(projectFolders.id, row.id));
  }

  const assetsToRewrite = await db
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId));
  for (const row of assetsToRewrite) {
    const nextFolder = rewriteFolderPath(row.folderPath, normalized, newPath);
    if (nextFolder === row.folderPath) continue;
    await db
      .update(assets)
      .set({ folderPath: nextFolder })
      .where(eq(assets.id, row.id));
  }

  if (!existing && foldersToRewrite.length === 0) {
    await ensureProjectFolder(projectId, newPath);
  }

  const [row] = await db
    .select()
    .from(projectFolders)
    .where(
      and(
        eq(projectFolders.projectId, projectId),
        eq(projectFolders.path, newPath),
      ),
    )
    .limit(1);
  if (!row) {
    await ensureProjectFolder(projectId, newPath);
    const [created] = await db
      .select()
      .from(projectFolders)
      .where(
        and(
          eq(projectFolders.projectId, projectId),
          eq(projectFolders.path, newPath),
        ),
      )
      .limit(1);
    return toFolderDTO(created!, []);
  }
  const tagMap = await tagsForFolders([row.id]);
  return toFolderDTO(row, tagMap.get(row.id) ?? []);
}

export async function deleteAssetRow(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!existing) return null;

  const [projectRow] = await db
    .select({
      mediaBackgroundAssetId: projects.mediaBackgroundAssetId,
      mediaBackgroundMode: projects.mediaBackgroundMode,
    })
    .from(projects)
    .where(eq(projects.id, existing.projectId))
    .limit(1);

  if (projectRow?.mediaBackgroundAssetId === id) {
    await db
      .update(projects)
      .set({
        mediaBackgroundAssetId: null,
        ...(projectRow.mediaBackgroundMode === "fixed"
          ? { mediaBackgroundMode: "off" as const }
          : {}),
      })
      .where(eq(projects.id, existing.projectId));
  }

  const [row] = await db.delete(assets).where(eq(assets.id, id)).returning();
  return row ?? null;
}

export async function ancestorsOf(id: string): Promise<ProjectDTO[]> {
  const all = await listProjects();
  const byId = new Map(all.map((p) => [p.id, p]));
  const chain: ProjectDTO[] = [];
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current?.parentId) {
    if (seen.has(current.parentId)) break;
    seen.add(current.parentId);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export async function childrenOf(id: string): Promise<ProjectDTO[]> {
  const all = await listProjects();
  return all.filter((p) => p.parentId === id);
}
