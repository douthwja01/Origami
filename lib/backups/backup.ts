import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { desc, eq, sql } from "drizzle-orm";
import { ProjectChecksum } from "@/lib/backups/checksum";
import { getDb } from "@/lib/db";
import {
  appSettings,
  assets,
  projectBackups,
  projects,
} from "@/lib/db/schema";
import { vaultRoot } from "@/lib/vault/vault";
import {
  backupsEligibleForPrune,
  isBackupIntervalCount,
  isBackupIntervalUnit,
  isBackupRetentionAgeUnit,
  isBackupRetentionMode,
  DEFAULT_BACKUP_INTERVAL_COUNT,
  DEFAULT_BACKUP_INTERVAL_UNIT,
  DEFAULT_BACKUP_RETENTION_COUNT,
  DEFAULT_BACKUP_RETENTION_MODE,
  DEFAULT_BACKUP_RETENTION_UNIT,
  projectBackupFilename,
  type BackupIntervalUnit,
  type BackupPassResult,
  type BackupRetentionAgeUnit,
  type BackupRetentionMode,
  type BackupSettings,
  type ProjectBackupDTO,
} from "@/lib/backups/backup-types";

export {
  BACKUP_INTERVAL_UNITS,
  BACKUP_RETENTION_AGE_UNITS,
  BACKUP_RETENTION_MODES,
  backupIntervalDue,
  backupPastRetention,
  backupsEligibleForPrune,
  isBackupIntervalCount,
  isBackupIntervalUnit,
  isBackupRetentionAgeUnit,
  isBackupRetentionMode,
  type BackupIntervalUnit,
  type BackupPassResult,
  type BackupRetentionAgeUnit,
  type BackupRetentionMode,
  type BackupSettings,
  type ProjectBackupDTO,
} from "@/lib/backups/backup-types";

export function backupRoot(): string {
  return process.env.ORIGAMI_BACKUP_DIR || path.join(process.cwd(), "data", "backups");
}

function logBackup(level: "info" | "error", message: string, error?: unknown) {
  const line = `[origami] ${message}`;
  if (error !== undefined) console[level](line, error);
  else console[level](line);
}

function joinBackup(...parts: string[]): string {
  const configured = process.env.ORIGAMI_BACKUP_DIR;
  if (configured) {
    return path.join(/*turbopackIgnore: true*/ configured, ...parts);
  }
  return path.join(process.cwd(), "data", "backups", ...parts);
}

function resolveBackupPath(storagePath: string): string {
  const parts = storagePath.split(/[/\\]/).filter((part) => part && part !== "." && part !== "..");
  if (parts.length === 0) {
    throw new Error("Invalid backup path");
  }
  const dest = path.resolve(joinBackup(...parts));
  const root = path.resolve(backupRoot());
  const rel = path.relative(root, dest);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid backup path");
  }
  return dest;
}

export async function backupStats() {
  const db = getDb();
  const [projectRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects);
  const [assetRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${assets.sizeBytes}), 0)::bigint`,
    })
    .from(assets);
  return {
    projectCount: Number(projectRow?.count ?? 0),
    assetCount: Number(assetRow?.count ?? 0),
    vaultBytes: Number(assetRow?.bytes ?? 0),
  };
}

async function backupManifest() {
  const db = getDb();
  const projectRows = await db.select().from(projects);
  const assetRows = await db.select().from(assets);
  return {
    version: 1,
    app: "origami",
    createdAt: new Date().toISOString(),
    vaultEntry: path.basename(vaultRoot()),
    projects: projectRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    assets: assetRows.map((row) => ({
      ...row,
      sizeBytes: Number(row.sizeBytes),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

function runTar(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
  });
}

export async function createBackupStream(): Promise<{
  stream: Readable;
  filename: string;
}> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `origami-backup-${stamp}.tar.gz`;
  logBackup("info", `full backup started (${filename})`);
  try {
    const tmp = await mkdtemp(path.join(tmpdir(), "origami-backup-"));
    const manifestName = "origami-backup.json";
    await writeFile(
      path.join(tmp, manifestName),
      `${JSON.stringify(await backupManifest(), null, 2)}\n`,
    );

    const vault = vaultRoot();
    let vaultExists = false;
    try {
      await access(vault);
      vaultExists = true;
    } catch {
      vaultExists = false;
    }

    const args = ["-c", "-z", "-f", "-", "-C", tmp, manifestName];
    if (vaultExists) {
      args.push("-C", path.dirname(vault), path.basename(vault));
    }

    const child = spawn("tar", args, { windowsHide: true });
    const cleanup = () => {
      void rm(tmp, { recursive: true, force: true });
    };
    child.on("close", (code) => {
      cleanup();
      if (code === 0) {
        logBackup("info", `full backup finished (${filename})`);
      } else {
        logBackup(
          "error",
          `full backup failed (${filename}): tar exited with code ${code}`,
        );
      }
    });
    child.on("error", cleanup);

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", (error) => {
        cleanup();
        reject(error);
      });
    });

    if (!child.stdout) {
      cleanup();
      throw new Error("Failed to start backup");
    }

    return { stream: child.stdout, filename };
  } catch (error) {
    logBackup("error", `full backup failed (${filename})`, error);
    throw error;
  }
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const db = getDb();
  let [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (!row) {
    [row] = await db.insert(appSettings).values({ id: 1 }).returning();
  }
  let lastSummary: BackupPassResult | null = null;
  if (row.backupLastSummary) {
    try {
      lastSummary = JSON.parse(row.backupLastSummary) as BackupPassResult;
      if (!lastSummary || typeof lastSummary !== "object") {
        lastSummary = null;
      } else if (typeof lastSummary.pruned !== "number") {
        lastSummary.pruned = 0;
      }
    } catch {
      lastSummary = null;
    }
  }
  const count = isBackupIntervalCount(row.backupIntervalCount)
    ? row.backupIntervalCount
    : DEFAULT_BACKUP_INTERVAL_COUNT;
  const unit = isBackupIntervalUnit(row.backupIntervalUnit)
    ? row.backupIntervalUnit
    : DEFAULT_BACKUP_INTERVAL_UNIT;
  const retentionCount = isBackupIntervalCount(row.backupRetentionCount)
    ? row.backupRetentionCount
    : DEFAULT_BACKUP_RETENTION_COUNT;
  const retentionUnit = isBackupRetentionAgeUnit(row.backupRetentionUnit)
    ? row.backupRetentionUnit
    : DEFAULT_BACKUP_RETENTION_UNIT;
  const retentionMode = isBackupRetentionMode(row.backupRetentionMode)
    ? row.backupRetentionMode
    : DEFAULT_BACKUP_RETENTION_MODE;
  return {
    enabled: row.backupEnabled,
    intervalCount: count,
    intervalUnit: unit,
    retentionMode,
    retentionCount,
    retentionUnit,
    nestFolders: row.backupNestFolders,
    lastRunAt: row.backupLastRunAt ? row.backupLastRunAt.toISOString() : null,
    lastSummary,
  };
}

export async function updateBackupSettings(patch: {
  enabled?: boolean;
  intervalCount?: number;
  intervalUnit?: BackupIntervalUnit;
  retentionMode?: BackupRetentionMode;
  retentionCount?: number;
  retentionUnit?: BackupRetentionAgeUnit;
  nestFolders?: boolean;
}): Promise<BackupSettings> {
  await getBackupSettings();
  const db = getDb();
  await db
    .update(appSettings)
    .set({
      ...(patch.enabled !== undefined ? { backupEnabled: patch.enabled } : {}),
      ...(patch.intervalCount !== undefined
        ? { backupIntervalCount: patch.intervalCount }
        : {}),
      ...(patch.intervalUnit !== undefined
        ? { backupIntervalUnit: patch.intervalUnit }
        : {}),
      ...(patch.retentionMode !== undefined
        ? { backupRetentionMode: patch.retentionMode }
        : {}),
      ...(patch.retentionCount !== undefined
        ? { backupRetentionCount: patch.retentionCount }
        : {}),
      ...(patch.retentionUnit !== undefined
        ? { backupRetentionUnit: patch.retentionUnit }
        : {}),
      ...(patch.nestFolders !== undefined
        ? { backupNestFolders: patch.nestFolders }
        : {}),
    })
    .where(eq(appSettings.id, 1));
  const settings = await getBackupSettings();
  if (
    patch.retentionMode !== undefined ||
    patch.retentionCount !== undefined ||
    patch.retentionUnit !== undefined
  ) {
    await pruneExpiredBackups(settings);
  }
  return settings;
}

function safeProjectFolder(code: string): string {
  const trimmed = code.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || "project";
  return trimmed.slice(0, 80);
}

async function writeProjectArchive(
  project: typeof projects.$inferSelect,
  checksum: string,
  nestFolders: boolean,
): Promise<{ filename: string; storagePath: string; sizeBytes: number }> {
  const db = getDb();
  const assetRows = await db
    .select()
    .from(assets)
    .where(eq(assets.projectId, project.id));

  const filename = projectBackupFilename(project.code);
  const folder = nestFolders ? safeProjectFolder(project.code) : null;
  const destDir = folder ? joinBackup(folder) : joinBackup();
  await mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, filename);

  const tmp = await mkdtemp(path.join(tmpdir(), "origami-project-backup-"));
  const manifestName = "origami-project.json";
  await writeFile(
    path.join(tmp, manifestName),
    `${JSON.stringify(
      {
        version: 1,
        kind: "project",
        checksum,
        createdAt: new Date().toISOString(),
        project: {
          ...project,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
          checksumAt: project.checksumAt?.toISOString() ?? null,
          lastBackupAt: project.lastBackupAt?.toISOString() ?? null,
        },
        assets: assetRows.map((row) => ({
          ...row,
          sizeBytes: Number(row.sizeBytes),
          createdAt: row.createdAt.toISOString(),
        })),
      },
      null,
      2,
    )}\n`,
  );

  const vaultDir = path.join(vaultRoot(), project.id);
  let hasFiles = false;
  try {
    await access(vaultDir);
    hasFiles = true;
  } catch {
    hasFiles = false;
  }

  // --force-local: GNU tar treats a colon in -f as a remote host.
  const args = ["--force-local", "-c", "-z", "-f", dest, "-C", tmp, manifestName];
  if (hasFiles) {
    args.push("-C", vaultRoot(), project.id);
  }

  try {
    await runTar(args);
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }

  const fileStat = await stat(dest);
  return {
    filename,
    storagePath: folder ? path.posix.join(folder, filename) : filename,
    sizeBytes: fileStat.size,
  };
}

export async function listProjectBackups(
  limit = 40,
): Promise<ProjectBackupDTO[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(projectBackups)
    .orderBy(desc(projectBackups.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    checksum: row.checksum,
    filename: row.filename,
    storagePath: row.storagePath,
    sizeBytes: Number(row.sizeBytes),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function pruneExpiredBackups(
  settings?: BackupSettings,
): Promise<number> {
  try {
    const resolved = settings ?? (await getBackupSettings());
    const db = getDb();
    const rows = await db.select().from(projectBackups);

    const remaining = new Map<string, number>();
    for (const row of rows) {
      remaining.set(row.projectId, (remaining.get(row.projectId) ?? 0) + 1);
    }

    const expired = backupsEligibleForPrune(rows, {
      mode: resolved.retentionMode,
      count: resolved.retentionCount,
      unit: resolved.retentionUnit,
    });

    if (expired.length === 0) return 0;

    logBackup("info", `backup prune started (${expired.length} candidate(s))`);

    let pruned = 0;
    const root = path.resolve(backupRoot());
    for (const row of expired) {
      if ((remaining.get(row.projectId) ?? 0) <= 1) continue;
      try {
        const dest = resolveBackupPath(row.storagePath);
        await rm(dest, { force: true });
        const parent = path.dirname(dest);
        if (parent !== root) {
          try {
            const leftover = await readdir(parent);
            if (leftover.length === 0) {
              await rm(parent, { recursive: true, force: true });
            }
          } catch {
            // Folder may already be gone or still contain other files.
          }
        }
        await db.delete(projectBackups).where(eq(projectBackups.id, row.id));
        remaining.set(row.projectId, (remaining.get(row.projectId) ?? 1) - 1);
        pruned += 1;
      } catch (error) {
        logBackup("error", `backup prune failed (${row.storagePath})`, error);
      }
    }
    logBackup("info", `backup prune finished (${pruned} deleted)`);
    return pruned;
  } catch (error) {
    logBackup("error", "backup prune failed", error);
    throw error;
  }
}

export async function backupProject(
  project: typeof projects.$inferSelect,
  options: { force?: boolean; nestFolders?: boolean } = {},
): Promise<"written" | "skipped"> {
  const db = getDb();
  const nestFolders =
    options.nestFolders ?? (await getBackupSettings()).nestFolders;
  const helper = await ProjectChecksum.forProject(project.id);
  const value = await helper.evaluate();
  if (!options.force && !(await helper.differsFrom(project.lastBackupChecksum))) {
    return "skipped";
  }
  logBackup("info", `backup started (${project.code})`);
  try {
    const written = await writeProjectArchive(project, value, nestFolders);
    await db.insert(projectBackups).values({
      projectId: project.id,
      code: project.code,
      checksum: value,
      filename: written.filename,
      storagePath: written.storagePath,
      sizeBytes: written.sizeBytes,
    });
    await db
      .update(projects)
      .set({
        lastBackupChecksum: value,
        lastBackupAt: new Date(),
      })
      .where(eq(projects.id, project.id));
    logBackup(
      "info",
      `backup finished (${project.code} → ${written.storagePath})`,
    );
    return "written";
  } catch (error) {
    logBackup("error", `backup failed (${project.code})`, error);
    throw error;
  }
}

/** Final snapshot when a project is archived. Failures are logged, not thrown. */
export async function backupArchivedProject(
  project: typeof projects.$inferSelect,
): Promise<void> {
  logBackup("info", `archive backup started (${project.code})`);
  try {
    await backupProject(project, { force: true });
    logBackup("info", `archive backup finished (${project.code})`);
  } catch (error) {
    logBackup("error", `archive backup failed (${project.code})`, error);
  }
  try {
    await pruneExpiredBackups();
  } catch {
    // pruneExpiredBackups already logged the failure
  }
}

export async function runBackupPass(): Promise<BackupPassResult> {
  logBackup("info", "backup pass started");
  try {
    const db = getDb();
    const settings = await getBackupSettings();
    const rows = await db.select().from(projects);
    const errors: { code: string; error: string }[] = [];
    let backedUp = 0;
    let skipped = 0;

    for (const project of rows) {
      if (project.status === "archived") {
        skipped += 1;
        continue;
      }
      try {
        const outcome = await backupProject(project, {
          nestFolders: settings.nestFolders,
        });
        if (outcome === "skipped") skipped += 1;
        else backedUp += 1;
      } catch (error) {
        errors.push({
          code: project.code,
          error: (error as Error).message || "Backup failed",
        });
      }
    }

    let pruned = 0;
    try {
      pruned = await pruneExpiredBackups(settings);
    } catch {
      // pruneExpiredBackups already logged the failure
    }

    const result: BackupPassResult = {
      ranAt: new Date().toISOString(),
      backedUp,
      skipped,
      failed: errors.length,
      pruned,
      errors,
    };

    await getBackupSettings();
    await db
      .update(appSettings)
      .set({
        backupLastRunAt: new Date(),
        backupLastSummary: JSON.stringify(result),
      })
      .where(eq(appSettings.id, 1));

    logBackup(
      "info",
      `backup pass finished (${backedUp} written, ${skipped} skipped, ${errors.length} failed, ${pruned} pruned)`,
    );
    return result;
  } catch (error) {
    logBackup("error", "backup pass failed", error);
    throw error;
  }
}

