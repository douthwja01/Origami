import { access, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, projectFolders, projects } from "@/lib/db/schema";
import { logOrigami } from "@/lib/settings/log";
import {
  folderParentAndName,
  uniquifyFilename,
} from "@/lib/vault/folder-path";
import {
  absoluteFromStorage,
  ensureProjectVault,
  ensureVaultFolder,
  projectVaultDir,
  relativeStoragePath,
} from "@/lib/vault/vault";

async function fileExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}

function folderKey(projectId: string, folderPath: string): string {
  return `${projectId}\0${folderPath}`;
}

/**
 * Move legacy `{projectId}/{assetId}/{filename}` files into
 * `{projectId}/{folderPath}/{filename}` and create on-disk folders.
 */
export async function migrateVaultLayout(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    const db = getDb();
    const assetRows = await db
      .select({
        id: assets.id,
        projectId: assets.projectId,
        folderPath: assets.folderPath,
        filename: assets.filename,
        storagePath: assets.storagePath,
      })
      .from(assets);
    const folderRows = await db
      .select({
        projectId: projectFolders.projectId,
        path: projectFolders.path,
      })
      .from(projectFolders);
    const projectRows = await db.select({ id: projects.id }).from(projects);

    const used = new Map<string, Set<string>>();
    for (const folder of folderRows) {
      const { parent, name } = folderParentAndName(folder.path);
      const key = folderKey(folder.projectId, parent);
      if (!used.has(key)) used.set(key, new Set());
      used.get(key)!.add(name);
    }

    const claimed = new Set<string>();
    for (const row of assetRows) {
      const key = folderKey(row.projectId, row.folderPath ?? "");
      if (!used.has(key)) used.set(key, new Set());
      const names = used.get(key)!;
      if (names.has(row.filename)) continue;
      names.add(row.filename);
      claimed.add(row.id);
    }

    let renamed = 0;
    for (const row of assetRows) {
      if (claimed.has(row.id)) continue;
      const key = folderKey(row.projectId, row.folderPath ?? "");
      const names = used.get(key)!;
      const next = uniquifyFilename(row.filename, names);
      names.add(next);
      row.filename = next;
      await db
        .update(assets)
        .set({ filename: next })
        .where(eq(assets.id, row.id));
      renamed += 1;
    }

    let moved = 0;
    for (const row of assetRows) {
      const desired = relativeStoragePath(
        row.projectId,
        row.folderPath ?? "",
        row.filename,
      );
      const current = row.storagePath.replace(/\\/g, "/");
      if (current === desired) continue;

      const from = absoluteFromStorage(current);
      const to = absoluteFromStorage(desired);
      const fromOk = await fileExists(from);
      const toOk = await fileExists(to);

      if (fromOk && toOk) {
        logOrigami(
          "warn",
          `vault layout skip (${row.id}): both ${current} and ${desired} exist`,
        );
        continue;
      }

      if (fromOk && !toOk) {
        await mkdir(path.dirname(to), { recursive: true });
        await rename(from, to);
        await db
          .update(assets)
          .set({ storagePath: desired })
          .where(eq(assets.id, row.id));
        moved += 1;
        continue;
      }

      if (!fromOk && toOk) {
        await db
          .update(assets)
          .set({ storagePath: desired })
          .where(eq(assets.id, row.id));
        moved += 1;
      }
    }

    for (const project of projectRows) {
      await ensureProjectVault(project.id);
    }
    for (const folder of folderRows) {
      await ensureVaultFolder(folder.projectId, folder.path);
    }

    const foldersByProject = new Map<string, Set<string>>();
    for (const folder of folderRows) {
      const set = foldersByProject.get(folder.projectId) ?? new Set();
      set.add(folder.path);
      foldersByProject.set(folder.projectId, set);
    }

    const assetsByProject = new Map<string, Set<string>>();
    for (const row of assetRows) {
      const set = assetsByProject.get(row.projectId) ?? new Set();
      set.add(row.id);
      assetsByProject.set(row.projectId, set);
    }

    for (const project of projectRows) {
      const dir = projectVaultDir(project.id);
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      const knownAssets = assetsByProject.get(project.id) ?? new Set();
      const knownFolders = foldersByProject.get(project.id) ?? new Set();
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!knownAssets.has(entry.name)) continue;
        if (knownFolders.has(entry.name)) continue;
        const leftoverDir = path.join(dir, entry.name);
        let leftover;
        try {
          leftover = await readdir(leftoverDir);
        } catch {
          continue;
        }
        if (leftover.length === 0) {
          await rm(leftoverDir, { recursive: true, force: true });
        }
      }
    }

    if (renamed > 0 || moved > 0) {
      logOrigami(
        "info",
        `vault layout migrated (${moved} file(s), ${renamed} renamed)`,
      );
    }
  } catch (error) {
    logOrigami("error", "vault layout migration failed", error);
  }
}
