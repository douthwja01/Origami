import {
  getBackupSettings,
  pruneExpiredBackups,
  runBackupPass,
} from "@/lib/backups/backup";
import { backupIntervalDue } from "@/lib/backups/backup-types";

const TICK_MS = 30_000;
const globalForBackup = globalThis as unknown as {
  origamiBackupTimer?: ReturnType<typeof setInterval>;
  origamiBackupRunning?: boolean;
};

export function startBackupScheduler() {
  if (globalForBackup.origamiBackupTimer) return;
  console.info("[origami] backup scheduler started");
  globalForBackup.origamiBackupTimer = setInterval(() => {
    void tick();
  }, TICK_MS);
  globalForBackup.origamiBackupTimer.unref?.();
  void tick();
}

async function tick() {
  if (globalForBackup.origamiBackupRunning) return;
  globalForBackup.origamiBackupRunning = true;
  try {
    const settings = await getBackupSettings();
    if (!settings.enabled) return;
    if (
      !backupIntervalDue(
        settings.lastRunAt,
        settings.intervalCount,
        settings.intervalUnit,
      )
    ) {
      await pruneExpiredBackups(settings);
      return;
    }
    console.info("[origami] scheduled backup started");
    const result = await runBackupPass();
    console.info(
      `[origami] scheduled backup finished (${result.backedUp} written, ${result.skipped} skipped, ${result.failed} failed, ${result.pruned} pruned)`,
    );
  } catch (error) {
    console.error("[origami] scheduled backup failed", error);
  } finally {
    globalForBackup.origamiBackupRunning = false;
  }
}
