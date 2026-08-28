import { spawn } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { backupRoot, resolveBackupPath } from "@/lib/backups/backup";
import { getDb } from "@/lib/db";
import { projectBackups, projects } from "@/lib/db/schema";
import { formatBytes } from "@/lib/shared/format";
import { logOrigami } from "@/lib/settings/log";

const SETTLE_MS = 15_000;
const MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
const BACKUP_NAME_RE =
  /^(\d{4}-\d{2}-\d{2}@\d{2}-\d{2}-\d{2}) (.+)\.tar\.gz$/i;
const IGNORED_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

type Fingerprint = { size: number; mtimeMs: number };

type DiskBackup = {
  filename: string;
  storagePath: string;
  absPath: string;
  size: number;
  mtimeMs: number;
};

type ProjectRef = { id: string; code: string };

const globalForBackupScan = globalThis as unknown as {
  origamiBackupPendingFiles?: Map<string, Fingerprint>;
  origamiBackupMissing?: Set<string>;
  origamiBackupUntracked?: Map<string, Fingerprint>;
};

function pendingFiles(): Map<string, Fingerprint> {
  if (!globalForBackupScan.origamiBackupPendingFiles) {
    globalForBackupScan.origamiBackupPendingFiles = new Map();
  }
  return globalForBackupScan.origamiBackupPendingFiles;
}

function missingBackups(): Set<string> {
  if (!globalForBackupScan.origamiBackupMissing) {
    globalForBackupScan.origamiBackupMissing = new Set();
  }
  return globalForBackupScan.origamiBackupMissing;
}

function untrackedFiles(): Map<string, Fingerprint> {
  if (!globalForBackupScan.origamiBackupUntracked) {
    globalForBackupScan.origamiBackupUntracked = new Map();
  }
  return globalForBackupScan.origamiBackupUntracked;
}

function isIgnoredName(name: string): boolean {
  if (IGNORED_NAMES.has(name.toLowerCase())) return true;
  return name.startsWith(".renaming-");
}

function isBackupArchive(name: string): boolean {
  return name.toLowerCase().endsWith(".tar.gz");
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}

function fingerprintsMatch(a: Fingerprint, b: Fingerprint): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

function filenameLabel(code: string): string {
  return (
    code.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/\.+$/, "").trim() ||
    "project"
  ).slice(0, 80);
}

function folderLabel(code: string): string {
  return (code.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || "project").slice(
    0,
    80,
  );
}

function parseBackupFilename(filename: string): {
  stamp: string;
  label: string;
} | null {
  const match = BACKUP_NAME_RE.exec(filename);
  if (!match) return null;
  return { stamp: match[1], label: match[2] };
}

function stampToDate(stamp: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})@(\d{2})-(\d{2})-(\d{2})$/.exec(stamp);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function readTarMember(archive: string, member: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      ["--force-local", "-xOf", archive, member],
      { windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(error);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MANIFEST_MAX_BYTES) {
        fail(new Error("manifest too large"));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.resume();
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
      else reject(new Error(`tar exited with code ${code}`));
    });
  });
}

function parseManifest(text: string): {
  checksum: string;
  projectId?: string;
  code?: string;
  createdAt?: Date;
} | null {
  let data: {
    checksum?: unknown;
    createdAt?: unknown;
    project?: { id?: unknown; code?: unknown };
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return null;
  }
  if (typeof data.checksum !== "string" || !data.checksum) return null;
  const projectId =
    typeof data.project?.id === "string" ? data.project.id : undefined;
  const code =
    typeof data.project?.code === "string" ? data.project.code : undefined;
  let createdAt: Date | undefined;
  if (typeof data.createdAt === "string") {
    const parsed = new Date(data.createdAt);
    if (!Number.isNaN(parsed.getTime())) createdAt = parsed;
  }
  return { checksum: data.checksum, projectId, code, createdAt };
}

async function walkBackupRoot(): Promise<DiskBackup[] | null> {
  const root = backupRoot();
  const files: DiskBackup[] = [];

  async function visit(
    absDir: string,
    relDir: string,
    depth: number,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      if (!relDir) throw new Error("unreadable");
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || isIgnoredName(entry.name)) continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (depth >= 1) continue;
        await visit(abs, path.posix.join(relDir, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile() || !isBackupArchive(entry.name)) continue;
      let info;
      try {
        info = await stat(abs);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      files.push({
        filename: entry.name,
        storagePath: relDir ? path.posix.join(relDir, entry.name) : entry.name,
        absPath: abs,
        size: info.size,
        mtimeMs: info.mtimeMs,
      });
    }
  }

  try {
    await visit(root, "", 0);
  } catch {
    return null;
  }
  return files;
}

function matchProject(
  file: DiskBackup,
  indexes: {
    byCode: Map<string, ProjectRef>;
    byFileLabel: Map<string, ProjectRef>;
    byFolder: Map<string, ProjectRef>;
  },
): ProjectRef | undefined {
  const parsed = parseBackupFilename(file.filename);
  if (parsed) {
    const exact = indexes.byCode.get(parsed.label);
    if (exact) return exact;
    const labeled = indexes.byFileLabel.get(parsed.label);
    if (labeled) return labeled;
  }
  const slash = file.storagePath.lastIndexOf("/");
  if (slash === -1) return undefined;
  return indexes.byFolder.get(file.storagePath.slice(0, slash));
}

export type BackupScanResult = {
  discovered: number;
  removed: number;
  aborted: boolean;
};

function emptyResult(aborted = false): BackupScanResult {
  return { discovered: 0, removed: 0, aborted };
}

/**
 * Reconcile on-disk project archives with backup rows.
 * Periodic scans confirm new files and dead refs across two passes.
 * Immediate scans (backup run, backups page) apply settled changes now.
 */
export async function scanBackups(
  options: { immediate?: boolean } = {},
): Promise<BackupScanResult> {
  if (!process.env.DATABASE_URL) return emptyResult(true);

  const db = getDb();
  const rows = await db
    .select({
      id: projectBackups.id,
      projectId: projectBackups.projectId,
      code: projectBackups.code,
      filename: projectBackups.filename,
      storagePath: projectBackups.storagePath,
    })
    .from(projectBackups);
  const projectRows = await db
    .select({ id: projects.id, code: projects.code })
    .from(projects);

  const walked = await walkBackupRoot();
  if (!walked) {
    if (rows.length > 0) {
      logOrigami("error", "backup scan aborted (backup directory missing)");
      return emptyResult(true);
    }
    return emptyResult();
  }

  const pending = pendingFiles();
  const missing = missingBackups();
  const untracked = untrackedFiles();
  const seenPending = new Set<string>();
  const result = emptyResult();
  const immediate = Boolean(options.immediate);
  const now = Date.now();

  const remaining: { storagePath: string }[] = [];
  for (const row of rows) {
    let present = false;
    try {
      present = await pathExists(resolveBackupPath(row.storagePath));
    } catch {
      present = false;
    }
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
    await db.delete(projectBackups).where(eq(projectBackups.id, row.id));
    result.removed += 1;
    logOrigami(
      "info",
      `backup scan removed dead reference (${row.filename}) for ${row.code}`,
    );
  }

  const knownStorage = new Set(remaining.map((row) => row.storagePath));
  const indexes = {
    byId: new Map(projectRows.map((row) => [row.id, row])),
    byCode: new Map(projectRows.map((row) => [row.code, row])),
    byFileLabel: new Map<string, ProjectRef>(),
    byFolder: new Map<string, ProjectRef>(),
  };
  for (const row of projectRows) {
    indexes.byFileLabel.set(filenameLabel(row.code), row);
    indexes.byFolder.set(folderLabel(row.code), row);
  }

  for (const file of walked) {
    if (knownStorage.has(file.storagePath)) {
      pending.delete(file.storagePath);
      untracked.delete(file.storagePath);
      continue;
    }

    const fingerprint = { size: file.size, mtimeMs: file.mtimeMs };
    const priorUntracked = untracked.get(file.storagePath);
    if (priorUntracked && fingerprintsMatch(priorUntracked, fingerprint)) {
      pending.delete(file.storagePath);
      continue;
    }

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

    let project = matchProject(file, indexes);
    let checksum: string | null = null;
    let createdAt: Date | undefined;
    try {
      const manifest = parseManifest(
        await readTarMember(file.absPath, "origami-project.json"),
      );
      if (manifest) {
        checksum = manifest.checksum;
        createdAt = manifest.createdAt;
        if (manifest.projectId && indexes.byId.has(manifest.projectId)) {
          project = indexes.byId.get(manifest.projectId) ?? project;
        } else if (manifest.code && indexes.byCode.has(manifest.code)) {
          project = indexes.byCode.get(manifest.code) ?? project;
        }
      }
    } catch {
      // Filename matching still applies when the archive has no manifest.
    }

    if (!project || !checksum) {
      untracked.set(file.storagePath, fingerprint);
      logOrigami(
        "warn",
        `backup scan ignored untracked archive (${file.storagePath})`,
      );
      continue;
    }

    const parsed = parseBackupFilename(file.filename);
    if (!createdAt && parsed) {
      createdAt = stampToDate(parsed.stamp) ?? undefined;
    }

    await db.insert(projectBackups).values({
      projectId: project.id,
      code: project.code,
      checksum,
      filename: file.filename,
      storagePath: file.storagePath,
      sizeBytes: file.size,
      ...(createdAt ? { createdAt } : {}),
    });
    knownStorage.add(file.storagePath);
    untracked.delete(file.storagePath);
    result.discovered += 1;
    logOrigami(
      "info",
      `backup scan discovered (${file.filename}, ${formatBytes(file.size)}) for ${project.code}`,
    );
  }

  for (const key of [...pending.keys()]) {
    if (!seenPending.has(key) && !knownStorage.has(key)) pending.delete(key);
  }

  if (result.discovered || result.removed) {
    const parts: string[] = [];
    if (result.discovered) parts.push(`${result.discovered} archive(s) added`);
    if (result.removed) {
      parts.push(`${result.removed} dead reference(s) removed`);
    }
    logOrigami("info", `backup scan finished (${parts.join(", ")})`);
  }

  return result;
}
