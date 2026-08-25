import { json, isResponse, requireUser } from "@/lib/api";
import {
  backupRoot,
  backupStats,
  getBackupSettings,
  isBackupIntervalCount,
  isBackupIntervalUnit,
  isBackupRetentionAgeUnit,
  isBackupRetentionMode,
  listProjectBackups,
  runBackupPass,
  updateBackupSettings,
} from "@/lib/backup";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const [settings, stats, runs] = await Promise.all([
    getBackupSettings(),
    backupStats(),
    listProjectBackups(),
  ]);

  return json({
    settings,
    stats,
    runs,
    backupDir: backupRoot(),
  });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: {
    enabled?: boolean;
    intervalCount?: number;
    intervalUnit?: string;
    retentionMode?: string;
    retentionCount?: number;
    retentionUnit?: string;
    nestFolders?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return json({ error: "enabled must be a boolean" }, 400);
  }
  if (body.intervalCount !== undefined && !isBackupIntervalCount(body.intervalCount)) {
    return json({ error: "Interval must be a whole number from 1 to 999" }, 400);
  }
  if (body.intervalUnit !== undefined && !isBackupIntervalUnit(body.intervalUnit)) {
    return json({ error: "Interval unit must be days, weeks, months, or years" }, 400);
  }
  if (body.retentionMode !== undefined && !isBackupRetentionMode(body.retentionMode)) {
    return json({ error: "Retention mode must be a fixed count or an age limit" }, 400);
  }
  if (body.retentionCount !== undefined && !isBackupIntervalCount(body.retentionCount)) {
    return json({ error: "Retention must be a whole number from 1 to 999" }, 400);
  }
  if (body.retentionUnit !== undefined && !isBackupRetentionAgeUnit(body.retentionUnit)) {
    return json({ error: "Retention unit must be weeks, months, years, or decades" }, 400);
  }
  if (body.nestFolders !== undefined && typeof body.nestFolders !== "boolean") {
    return json({ error: "nestFolders must be a boolean" }, 400);
  }

  const settings = await updateBackupSettings({
    enabled: body.enabled,
    intervalCount: body.intervalCount,
    intervalUnit: body.intervalUnit,
    retentionMode: body.retentionMode,
    retentionCount: body.retentionCount,
    retentionUnit: body.retentionUnit,
    nestFolders: body.nestFolders,
  });
  return json({ settings });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.action && body.action !== "run") {
    return json({ error: "Unknown action" }, 400);
  }

  try {
    const result = await runBackupPass();
    const settings = await getBackupSettings();
    return json({ result, settings });
  } catch (error) {
    return json(
      { error: (error as Error).message || "Backup pass failed" },
      500,
    );
  }
}
