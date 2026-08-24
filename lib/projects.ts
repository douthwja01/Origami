import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import {
  formatRootProjectCode,
  nextChildCode,
} from "@/lib/project-code";
import type { AssetDTO, AssetKind, ProjectDTO, ProjectStatus } from "@/lib/types";
import { removeProjectVault } from "@/lib/vault";

function emptyKinds(): Record<AssetKind, number> {
  return { media: 0, code: 0, document: 0, cad: 0 };
}

export function toProjectDTO(
  row: typeof projects.$inferSelect,
  childCount: number,
  assetsByKind: Record<AssetKind, number>,
): ProjectDTO {
  const assetCount = Object.values(assetsByKind).reduce((a, b) => a + b, 0);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    startDate: row.startDate,
    status: row.status,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    childCount,
    assetCount,
    assetsByKind,
  };
}

export function toAssetDTO(row: typeof assets.$inferSelect): AssetDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    createdAt: row.createdAt.toISOString(),
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

  return rows.map((row) =>
    toProjectDTO(row, childMap.get(row.id) ?? 0, kindMap.get(row.id) ?? emptyKinds()),
  );
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
  const [row] = await db
    .insert(projects)
    .values({
      code,
      title: input.title.trim(),
      startDate: input.startDate,
      status: input.status,
      parentId: input.parentId,
    })
    .returning();
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
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

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
  return rows.map(toAssetDTO);
}

export async function getAsset(id: string) {
  const db = getDb();
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return row ?? null;
}

export async function insertAsset(input: {
  projectId: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}) {
  const db = getDb();
  const [row] = await db.insert(assets).values(input).returning();
  return toAssetDTO(row);
}

export async function updateAsset(
  id: string,
  patch: { kind?: AssetKind },
): Promise<AssetDTO> {
  const existing = await getAsset(id);
  if (!existing) {
    throw Object.assign(new Error("Asset not found"), { status: 404 });
  }
  const [row] = await getDb()
    .update(assets)
    .set({
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    })
    .where(eq(assets.id, id))
    .returning();
  return toAssetDTO(row);
}

export async function deleteAssetRow(id: string) {
  const db = getDb();
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
