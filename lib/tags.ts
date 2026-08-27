import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assetTags, assets, folderTags, projectFolders, tags } from "@/lib/db/schema";
import { normalizeFolderPath } from "@/lib/folder-path";
import { kindTagName, isKindTagKey, tagKey } from "@/lib/tag-utils";
import { ASSET_KINDS, type AssetKind, type TagDTO } from "@/lib/types";

export {
  TAG_NAME_MAX,
  TAGS_PER_ITEM_MAX,
  firstTagSortKey,
  isKindTagKey,
  itemMatchesTagQuery,
  kindTagName,
  parseTagName,
  parseTagNames,
  tagKey,
} from "@/lib/tag-utils";

export function toTagDTO(row: typeof tags.$inferSelect): TagDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    key: row.key,
    required: row.required,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ensureKindTags(projectId: string): Promise<TagDTO[]> {
  const db = getDb();
  const existing = await db
    .select()
    .from(tags)
    .where(eq(tags.projectId, projectId));
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const result: TagDTO[] = [];
  for (const kind of ASSET_KINDS) {
    const name = kindTagName(kind);
    const current = byKey.get(kind);
    if (current) {
      if (!current.required || current.name !== name) {
        const [updated] = await db
          .update(tags)
          .set({ required: true, name })
          .where(eq(tags.id, current.id))
          .returning();
        result.push(toTagDTO(updated));
      } else {
        result.push(toTagDTO(current));
      }
      continue;
    }
    const [row] = await db
      .insert(tags)
      .values({ projectId, name, key: kind, required: true })
      .returning();
    result.push(toTagDTO(row));
  }
  return result;
}

export async function listProjectTags(projectId: string): Promise<TagDTO[]> {
  await ensureKindTags(projectId);
  const db = getDb();
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.projectId, projectId))
    .orderBy(desc(tags.required), asc(tags.key));
  return rows.map(toTagDTO);
}

export async function tagsForAssets(
  assetIds: string[],
): Promise<Map<string, TagDTO[]>> {
  const map = new Map<string, TagDTO[]>();
  if (assetIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      assetId: assetTags.assetId,
      tag: tags,
    })
    .from(assetTags)
    .innerJoin(tags, eq(assetTags.tagId, tags.id))
    .where(inArray(assetTags.assetId, assetIds));
  for (const row of rows) {
    const list = map.get(row.assetId) ?? [];
    list.push(toTagDTO(row.tag));
    map.set(row.assetId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(b.required) - Number(a.required) || a.key.localeCompare(b.key));
  }
  return map;
}

export async function tagsForFolders(
  folderIds: string[],
): Promise<Map<string, TagDTO[]>> {
  const map = new Map<string, TagDTO[]>();
  if (folderIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      folderId: folderTags.folderId,
      tag: tags,
    })
    .from(folderTags)
    .innerJoin(tags, eq(folderTags.tagId, tags.id))
    .where(inArray(folderTags.folderId, folderIds));
  for (const row of rows) {
    const list = map.get(row.folderId) ?? [];
    list.push(toTagDTO(row.tag));
    map.set(row.folderId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.key.localeCompare(b.key));
  }
  return map;
}

async function ensureTags(
  projectId: string,
  names: string[],
): Promise<TagDTO[]> {
  const result: TagDTO[] = [];
  const db = getDb();
  for (const name of names) {
    const key = tagKey(name);
    const system = isKindTagKey(key);
    const storedName = system ? kindTagName(key as AssetKind) : name;
    const [existing] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.projectId, projectId), eq(tags.key, key)))
      .limit(1);
    if (existing) {
      if (system && (!existing.required || existing.name !== storedName)) {
        const [updated] = await db
          .update(tags)
          .set({ required: true, name: storedName })
          .where(eq(tags.id, existing.id))
          .returning();
        result.push(toTagDTO(updated));
      } else {
        result.push(toTagDTO(existing));
      }
      continue;
    }
    const [row] = await db
      .insert(tags)
      .values({
        projectId,
        name: storedName,
        key,
        required: system,
      })
      .returning();
    result.push(toTagDTO(row));
  }
  return result;
}

export async function assignRequiredKindTag(
  assetId: string,
  projectId: string,
  kind: AssetKind,
): Promise<TagDTO[]> {
  const required = await ensureTags(projectId, [kindTagName(kind)]);
  const db = getDb();
  const existing = await db
    .select({ tagId: assetTags.tagId })
    .from(assetTags)
    .where(
      and(eq(assetTags.assetId, assetId), eq(assetTags.tagId, required[0].id)),
    )
    .limit(1);
  if (!existing[0]) {
    await db.insert(assetTags).values({ assetId, tagId: required[0].id });
  }
  const map = await tagsForAssets([assetId]);
  return map.get(assetId) ?? required;
}

export async function setAssetTags(
  assetId: string,
  projectId: string,
  names: string[],
): Promise<TagDTO[]> {
  const db = getDb();
  const [asset] = await db
    .select({ kind: assets.kind })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!asset) {
    throw Object.assign(new Error("Asset not found"), { status: 404 });
  }
  const requiredName = kindTagName(asset.kind);
  const extra = names.filter((name) => !isKindTagKey(tagKey(name)));
  const resolved = await ensureTags(projectId, [requiredName, ...extra]);
  await db.delete(assetTags).where(eq(assetTags.assetId, assetId));
  if (resolved.length > 0) {
    await db.insert(assetTags).values(
      resolved.map((tag) => ({ assetId, tagId: tag.id })),
    );
  }
  return resolved;
}

async function ensureFolderId(projectId: string, path: string): Promise<string> {
  const normalized = normalizeFolderPath(path);
  if (!normalized) {
    throw Object.assign(new Error("Cannot tag the root folder"), {
      status: 400,
    });
  }
  const db = getDb();
  const [existing] = await db
    .select({ id: projectFolders.id })
    .from(projectFolders)
    .where(
      and(
        eq(projectFolders.projectId, projectId),
        eq(projectFolders.path, normalized),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(projectFolders)
    .values({ projectId, path: normalized })
    .returning({ id: projectFolders.id });
  return row.id;
}

export async function setFolderTags(
  projectId: string,
  path: string,
  names: string[],
): Promise<TagDTO[]> {
  const folderId = await ensureFolderId(projectId, path);
  const db = getDb();
  const extra = names.filter((name) => !isKindTagKey(tagKey(name)));
  const resolved = await ensureTags(projectId, extra);
  await db.delete(folderTags).where(eq(folderTags.folderId, folderId));
  if (resolved.length > 0) {
    await db.insert(folderTags).values(
      resolved.map((tag) => ({ folderId, tagId: tag.id })),
    );
  }
  return resolved;
}
