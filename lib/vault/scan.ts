import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, projectFolders, projects } from "@/lib/db/schema";
import {
  deleteAssetRow,
  ensureProjectFolder,
  insertAsset,
} from "@/lib/projects/projects";
import { isHiddenFolderPath } from "@/lib/projects/project-background";
import { formatBytes } from "@/lib/shared/format";
import { logOrigami } from "@/lib/settings/log";
import {
  FOLDER_PATH_MAX,
  isUnderFolderPath,
  joinFolderPath,
  normalizeFolderPath,
  parseFolderName,
} from "@/lib/vault/folder-path";
import { inferKind, mimeFromFilename } from "@/lib/vault/kinds";
import {
  absoluteFromStorage,
  hashFileSha256,
  projectVaultDir,
  relativeStoragePath,
  VAULT_SETTINGS_DIR,
  vaultRoot,
} from "@/lib/vault/vault";

const IGNORED_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
const SETTLE_MS = 15_000;

type Fingerprint = { size: number; mtimeMs: number };

type DiskFile = {
  folderPath: string;
  filename: string;
  absPath: string;
  size: number;
  mtimeMs: number;
  storagePath: string;
};

type AssetRow = {
  id: string;
  projectId: string;
  folderPath: string;
  filename: string;
  storagePath: string;
};

type FolderRow = {
  id: string;
  projectId: string;
  path: string;
};

const globalForScan = globalThis as unknown as {
  origamiVaultPendingFiles?: Map<string, Fingerprint>;
  origamiVaultMissingAssets?: Set<string>;
  origamiVaultMissingProjects?: Set<string>;
  origamiVaultUntracked?: Set<string>;
};

function pendingFiles(): Map<string, Fingerprint> {
  if (!globalForScan.origamiVaultPendingFiles) {
    globalForScan.origamiVaultPendingFiles = new Map();
  }
  return globalForScan.origamiVaultPendingFiles;
}

function missingAssets(): Set<string> {
  if (!globalForScan.origamiVaultMissingAssets) {
    globalForScan.origamiVaultMissingAssets = new Set();
  }
  return globalForScan.origamiVaultMissingAssets;
}

function missingProjects(): Set<string> {
  if (!globalForScan.origamiVaultMissingProjects) {
    globalForScan.origamiVaultMissingProjects = new Set();
  }
  return globalForScan.origamiVaultMissingProjects;
}

function untrackedNames(): Set<string> {
  if (!globalForScan.origamiVaultUntracked) {
    globalForScan.origamiVaultUntracked = new Set();
  }
  return globalForScan.origamiVaultUntracked;
}

function isIgnoredName(name: string): boolean {
  if (IGNORED_NAMES.has(name.toLowerCase())) return true;
  return name.startsWith(".renaming-");
}

function isImportableFilename(name: string): boolean {
  if (!name || name.length > 240) return false;
  if (name === "." || name === ".." || /[\\/]/.test(name)) return false;
  if (/[<>:"|?*\u0000-\u001f]/.test(name)) return false;
  return true;
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}

function locationLabel(code: string, folderPath: string): string {
  return folderPath ? `${code}/${folderPath}` : code;
}

function fileKey(folderPath: string, filename: string): string {
  return `${folderPath}\0${filename}`;
}

function fingerprintsMatch(a: Fingerprint, b: Fingerprint): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

async function walkProject(
  projectId: string,
  projectDir: string,
): Promise<{ files: DiskFile[]; folders: string[] } | null> {
  const files: DiskFile[] = [];
  const folders: string[] = [];

  async function visit(absDir: string, folderPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      if (!folderPath) throw new Error("unreadable");
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink() || isIgnoredName(entry.name)) continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        const name = parseFolderName(entry.name);
        if (!name) continue;
        const nextPath = joinFolderPath(folderPath, name);
        if (nextPath.length > FOLDER_PATH_MAX) continue;
        folders.push(nextPath);
        await visit(abs, nextPath);
        continue;
      }
      if (!entry.isFile() || !isImportableFilename(entry.name)) continue;
      const normalizedFolder = normalizeFolderPath(folderPath);
      if (normalizedFolder === null) continue;
      let info;
      try {
        info = await stat(abs);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      files.push({
        folderPath: normalizedFolder,
        filename: entry.name,
        absPath: abs,
        size: info.size,
        mtimeMs: info.mtimeMs,
        storagePath: relativeStoragePath(
          projectId,
          normalizedFolder,
          entry.name,
        ),
      });
    }
  }

  try {
    await visit(projectDir, "");
  } catch {
    return null;
  }
  return { files, folders };
}

export type VaultScanResult = {
  discovered: number;
  removed: number;
  foldersAdded: number;
  foldersRemoved: number;
  aborted: boolean;
};

function emptyResult(aborted = false): VaultScanResult {
  return {
    discovered: 0,
    removed: 0,
    foldersAdded: 0,
    foldersRemoved: 0,
    aborted,
  };
}

/**
 * Reconcile on-disk vault files with project asset/folder rows.
 * Periodic scans confirm new files and dead refs across two passes.
 * Immediate scans (startup, backup run) apply settled changes now.
 */
export async function scanVault(
  options: { immediate?: boolean } = {},
): Promise<VaultScanResult> {
  if (!process.env.DATABASE_URL) return emptyResult(true);

  const immediate = Boolean(options.immediate);
  const now = Date.now();

  const db = getDb();
  const projectRows = await db
    .select({
      id: projects.id,
      code: projects.code,
      title: projects.title,
    })
    .from(projects);
  const knownProjectIds = new Set(projectRows.map((row) => row.id));

  let rootEntries;
  try {
    rootEntries = await readdir(vaultRoot(), { withFileTypes: true });
  } catch {
    logOrigami("error", "vault scan aborted (vault directory missing)");
    return emptyResult(true);
  }

  const seenUntracked = untrackedNames();
  let onDiskProjectDirs = 0;
  for (const entry of rootEntries) {
    if (entry.name === VAULT_SETTINGS_DIR) continue;
    if (knownProjectIds.has(entry.name)) {
      onDiskProjectDirs += 1;
      continue;
    }
    if (seenUntracked.has(entry.name)) continue;
    seenUntracked.add(entry.name);
    logOrigami("warn", `vault scan ignored untracked path (${entry.name})`);
  }

  if (projectRows.length > 0 && onDiskProjectDirs === 0) {
    logOrigami("error", "vault scan aborted (no project folders on disk)");
    return emptyResult(true);
  }

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
      id: projectFolders.id,
      projectId: projectFolders.projectId,
      path: projectFolders.path,
    })
    .from(projectFolders);

  const assetsByProject = new Map<string, AssetRow[]>();
  for (const row of assetRows) {
    const list = assetsByProject.get(row.projectId) ?? [];
    list.push(row);
    assetsByProject.set(row.projectId, list);
  }
  const foldersByProject = new Map<string, FolderRow[]>();
  for (const row of folderRows) {
    const list = foldersByProject.get(row.projectId) ?? [];
    list.push(row);
    foldersByProject.set(row.projectId, list);
  }

  const pending = pendingFiles();
  const missing = missingAssets();
  const goneProjects = missingProjects();
  const seenPending = new Set<string>();
  const result = emptyResult();

  for (const project of projectRows) {
    const projectDir = projectVaultDir(project.id);
    const walked = (await pathExists(projectDir))
      ? await walkProject(project.id, projectDir)
      : null;

    if (!walked) {
      if (!goneProjects.has(project.id)) {
        goneProjects.add(project.id);
        logOrigami(
          "warn",
          `vault scan skipped missing project folder (${project.code}: ${project.title})`,
        );
        continue;
      }
    } else {
      goneProjects.delete(project.id);
    }

    const counts = await reconcileProject({
      code: project.code,
      projectId: project.id,
      disk: walked ?? { files: [], folders: [] },
      dbAssets: assetsByProject.get(project.id) ?? [],
      dbFolders: foldersByProject.get(project.id) ?? [],
      pending,
      missing,
      seenPending,
      immediate,
      now,
    });
    result.discovered += counts.discovered;
    result.removed += counts.removed;
    result.foldersAdded += counts.foldersAdded;
    result.foldersRemoved += counts.foldersRemoved;
  }

  for (const key of [...pending.keys()]) {
    if (!seenPending.has(key)) pending.delete(key);
  }

  if (
    result.discovered ||
    result.removed ||
    result.foldersAdded ||
    result.foldersRemoved
  ) {
    const parts: string[] = [];
    if (result.discovered) parts.push(`${result.discovered} file(s) added`);
    if (result.removed) {
      parts.push(`${result.removed} dead reference(s) removed`);
    }
    if (result.foldersAdded) parts.push(`${result.foldersAdded} folder(s) added`);
    if (result.foldersRemoved) {
      parts.push(`${result.foldersRemoved} dead folder(s) removed`);
    }
    logOrigami("info", `vault scan finished (${parts.join(", ")})`);
  }

  return result;
}

async function reconcileProject(input: {
  code: string;
  projectId: string;
  disk: { files: DiskFile[]; folders: string[] };
  dbAssets: AssetRow[];
  dbFolders: FolderRow[];
  pending: Map<string, Fingerprint>;
  missing: Set<string>;
  seenPending: Set<string>;
  immediate: boolean;
  now: number;
}): Promise<Omit<VaultScanResult, "aborted">> {
  const {
    code,
    projectId,
    disk,
    dbAssets,
    dbFolders,
    pending,
    missing,
    seenPending,
    immediate,
    now,
  } = input;
  const counts = {
    discovered: 0,
    removed: 0,
    foldersAdded: 0,
    foldersRemoved: 0,
  };

  const diskStorage = new Set(disk.files.map((file) => file.storagePath));
  const diskFileKeys = new Set(
    disk.files.map((file) => fileKey(file.folderPath, file.filename)),
  );
  const diskFolders = new Set(disk.folders);
  const knownFolders = new Set(dbFolders.map((row) => row.path));

  const remaining: AssetRow[] = [];
  for (const row of dbAssets) {
    const present =
      diskStorage.has(row.storagePath) ||
      diskFileKeys.has(fileKey(row.folderPath, row.filename)) ||
      (await pathExists(absoluteFromStorage(row.storagePath)));
    if (present) {
      missing.delete(row.id);
      remaining.push(row);
      continue;
    }
    if (!immediate && !missing.has(row.id)) {
      missing.add(row.id);
      remaining.push(row);
      continue;
    }
    missing.delete(row.id);
    await deleteAssetRow(row.id);
    counts.removed += 1;
    logOrigami(
      "info",
      `vault scan removed dead reference (${row.filename}) from ${locationLabel(
        code,
        row.folderPath,
      )}`,
    );
  }

  const remainingStorage = new Set(remaining.map((row) => row.storagePath));
  const remainingFileKeys = new Set(
    remaining.map((row) => fileKey(row.folderPath, row.filename)),
  );

  for (const folderPath of disk.folders) {
    if (knownFolders.has(folderPath)) continue;
    try {
      await ensureProjectFolder(projectId, folderPath);
      knownFolders.add(folderPath);
      counts.foldersAdded += 1;
      logOrigami(
        "info",
        `vault scan discovered folder (${folderPath}) in ${code}`,
      );
    } catch (error) {
      logOrigami(
        "warn",
        `vault scan skipped folder (${folderPath}) in ${code}`,
        error,
      );
    }
  }

  for (const file of disk.files) {
    const key = fileKey(file.folderPath, file.filename);
    if (
      remainingStorage.has(file.storagePath) ||
      remainingFileKeys.has(key)
    ) {
      pending.delete(file.storagePath);
      continue;
    }

    const fingerprint = { size: file.size, mtimeMs: file.mtimeMs };
    if (now - file.mtimeMs < SETTLE_MS) {
      pending.set(file.storagePath, fingerprint);
      seenPending.add(file.storagePath);
      continue;
    }
    if (!immediate) {
      const previous = pending.get(file.storagePath);
      seenPending.add(file.storagePath);
      if (!previous || !fingerprintsMatch(previous, fingerprint)) {
        pending.set(file.storagePath, fingerprint);
        continue;
      }
    }
    pending.delete(file.storagePath);

    try {
      const contentHash = await hashFileSha256(file.absPath);
      await insertAsset({
        projectId,
        kind: inferKind(file.filename),
        folderPath: file.folderPath,
        filename: file.filename,
        mimeType: mimeFromFilename(file.filename),
        sizeBytes: file.size,
        storagePath: file.storagePath,
        contentHash,
        reservedFolder: isHiddenFolderPath(file.folderPath),
      });
      remainingStorage.add(file.storagePath);
      remainingFileKeys.add(key);
      counts.discovered += 1;
      logOrigami(
        "info",
        `vault scan discovered (${file.filename}, ${formatBytes(file.size)}) in ${locationLabel(
          code,
          file.folderPath,
        )}`,
      );
    } catch (error) {
      if ((error as { status?: number }).status === 409) continue;
      logOrigami(
        "warn",
        `vault scan failed to import (${file.filename}) in ${locationLabel(
          code,
          file.folderPath,
        )}`,
        error,
      );
    }
  }

  const db = getDb();
  for (const folder of dbFolders) {
    if (diskFolders.has(folder.path)) continue;
    const stillUsed = remaining.some(
      (row) =>
        row.folderPath === folder.path ||
        isUnderFolderPath(row.folderPath, folder.path),
    );
    if (stillUsed) continue;
    await db.delete(projectFolders).where(eq(projectFolders.id, folder.id));
    counts.foldersRemoved += 1;
    logOrigami(
      "info",
      `vault scan removed dead folder (${folder.path}) from ${code}`,
    );
  }

  return counts;
}
