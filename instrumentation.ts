export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installLogCapture } = await import("@/lib/log");
  installLogCapture();
  const { startBackupScheduler } = await import("@/lib/backup-scheduler");
  startBackupScheduler();
}
