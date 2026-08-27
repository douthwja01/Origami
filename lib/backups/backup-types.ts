export const BACKUP_INTERVAL_UNITS = ["day", "week", "month", "year"] as const;

export type BackupIntervalUnit = (typeof BACKUP_INTERVAL_UNITS)[number];

export const DEFAULT_BACKUP_INTERVAL_COUNT = 1;
export const DEFAULT_BACKUP_INTERVAL_UNIT: BackupIntervalUnit = "week";
export const DEFAULT_BACKUP_RETENTION_MODE: BackupRetentionMode = "age";
export const DEFAULT_BACKUP_RETENTION_COUNT = 4;
export const DEFAULT_BACKUP_RETENTION_UNIT: BackupRetentionAgeUnit = "week";

export const BACKUP_RETENTION_MODES = ["count", "age"] as const;
export type BackupRetentionMode = (typeof BACKUP_RETENTION_MODES)[number];

export const BACKUP_RETENTION_AGE_UNITS = [
  "week",
  "month",
  "year",
  "decade",
] as const;
export type BackupRetentionAgeUnit = (typeof BACKUP_RETENTION_AGE_UNITS)[number];

export function isBackupRetentionMode(
  value: unknown,
): value is BackupRetentionMode {
  return (
    typeof value === "string" &&
    BACKUP_RETENTION_MODES.includes(value as BackupRetentionMode)
  );
}

export function isBackupRetentionAgeUnit(
  value: unknown,
): value is BackupRetentionAgeUnit {
  return (
    typeof value === "string" &&
    BACKUP_RETENTION_AGE_UNITS.includes(value as BackupRetentionAgeUnit)
  );
}

export function isBackupIntervalUnit(
  value: unknown,
): value is BackupIntervalUnit {
  return (
    typeof value === "string" &&
    BACKUP_INTERVAL_UNITS.includes(value as BackupIntervalUnit)
  );
}

export function isBackupIntervalCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 999;
}

export function addBackupInterval(
  from: Date,
  count: number,
  unit: BackupIntervalUnit,
): Date {
  const next = new Date(from.getTime());
  switch (unit) {
    case "day":
      next.setDate(next.getDate() + count);
      break;
    case "week":
      next.setDate(next.getDate() + count * 7);
      break;
    case "month":
      next.setMonth(next.getMonth() + count);
      break;
    case "year":
      next.setFullYear(next.getFullYear() + count);
      break;
  }
  return next;
}

export function addBackupRetentionAge(
  from: Date,
  count: number,
  unit: BackupRetentionAgeUnit,
): Date {
  const next = new Date(from.getTime());
  switch (unit) {
    case "week":
      next.setDate(next.getDate() + count * 7);
      break;
    case "month":
      next.setMonth(next.getMonth() + count);
      break;
    case "year":
      next.setFullYear(next.getFullYear() + count);
      break;
    case "decade":
      next.setFullYear(next.getFullYear() + count * 10);
      break;
  }
  return next;
}

export function backupIntervalDue(
  lastRunAt: string | null,
  count: number,
  unit: BackupIntervalUnit,
  now = Date.now(),
): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt);
  if (Number.isNaN(last.getTime())) return true;
  return now >= addBackupInterval(last, count, unit).getTime();
}

/** True when `createdAt` is at least `count` age-units old. */
export function backupPastRetention(
  createdAt: Date | string,
  count: number,
  unit: BackupRetentionAgeUnit,
  now = Date.now(),
): boolean {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return (
    created.getTime() <=
    addBackupRetentionAge(new Date(now), -count, unit).getTime()
  );
}

function backupCreatedAtMs(createdAt: Date | string): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return created.getTime();
}

export type BackupRetentionPolicy = {
  mode: BackupRetentionMode;
  count: number;
  unit: BackupRetentionAgeUnit;
};

function newestFirst<T extends { createdAt: Date | string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => backupCreatedAtMs(b.createdAt) - backupCreatedAtMs(a.createdAt),
  );
}

/**
 * Backups that fall outside the retention policy. The newest backup for each
 * project is never returned, so at least one archive always remains.
 */
export function backupsEligibleForPrune<
  T extends { id: string; projectId: string; createdAt: Date | string },
>(rows: T[], policy: BackupRetentionPolicy, now = Date.now()): T[] {
  const byProject = new Map<string, T[]>();
  for (const row of rows) {
    const list = byProject.get(row.projectId) ?? [];
    list.push(row);
    byProject.set(row.projectId, list);
  }

  const expired: T[] = [];
  const keepCount = Math.max(1, policy.count);
  for (const group of byProject.values()) {
    if (group.length <= 1) continue;
    const ordered = newestFirst(group);
    if (policy.mode === "count") {
      expired.push(...ordered.slice(keepCount));
      continue;
    }
    for (const row of ordered.slice(1)) {
      if (backupPastRetention(row.createdAt, policy.count, policy.unit, now)) {
        expired.push(row);
      }
    }
  }
  return expired;
}

export function backupUnitLabel(unit: BackupIntervalUnit, count: number): string {
  const plural = count === 1 ? "" : "s";
  switch (unit) {
    case "day":
      return `day${plural}`;
    case "week":
      return `week${plural}`;
    case "month":
      return `month${plural}`;
    case "year":
      return `year${plural}`;
  }
}

export function retentionAgeUnitLabel(
  unit: BackupRetentionAgeUnit,
  count: number,
): string {
  const plural = count === 1 ? "" : "s";
  switch (unit) {
    case "week":
      return `week${plural}`;
    case "month":
      return `month${plural}`;
    case "year":
      return `year${plural}`;
    case "decade":
      return `decade${plural}`;
  }
}

export type BackupPassResult = {
  ranAt: string;
  backedUp: number;
  skipped: number;
  failed: number;
  pruned: number;
  errors: { code: string; error: string }[];
};

export type BackupSettings = {
  enabled: boolean;
  intervalCount: number;
  intervalUnit: BackupIntervalUnit;
  retentionMode: BackupRetentionMode;
  retentionCount: number;
  retentionUnit: BackupRetentionAgeUnit;
  nestFolders: boolean;
  lastRunAt: string | null;
  lastSummary: BackupPassResult | null;
};

export type ProjectBackupDTO = {
  id: string;
  projectId: string;
  code: string;
  checksum: string;
  filename: string;
  storagePath: string;
  sizeBytes: number;
  createdAt: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-08-25@15-26-02` in the process local timezone. Colons are invalid on Windows. */
export function projectBackupStamp(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}@${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
}

export function projectBackupFilename(code: string, date = new Date()): string {
  const label =
    code.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/\.+$/, "").trim() ||
    "project";
  return `${projectBackupStamp(date)} ${label.slice(0, 80)}.tar.gz`;
}
