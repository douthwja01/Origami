export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installLogCapture } = await import("@/lib/settings/log");
  installLogCapture();
  const { startBackupScheduler } = await import("@/lib/backups/backup-scheduler");
  startBackupScheduler();
}
