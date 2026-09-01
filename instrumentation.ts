export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installLogCapture } = await import("@/lib/settings/log");
  installLogCapture();
  const { hydrateVaultDirFromSettings } = await import(
    "@/lib/settings/vault-settings"
  );
  await hydrateVaultDirFromSettings();
  const { migrateVaultLayout } = await import("@/lib/vault/migrate-layout");
  await migrateVaultLayout();
  const { runStorageReconcile, startVaultScanner } = await import(
    "@/lib/vault/scan-scheduler"
  );
  await runStorageReconcile({ immediate: true });
  const { startBackupScheduler } = await import("@/lib/backups/backup-scheduler");
  startBackupScheduler();
  startVaultScanner();
}
