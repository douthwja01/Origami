const RETRY_MS = 5_000;

const globalForStartup = globalThis as unknown as {
  origamiServicesStarted?: boolean;
  origamiStartupRetry?: ReturnType<typeof setTimeout>;
};

async function startServices() {
  if (globalForStartup.origamiServicesStarted) return;
  globalForStartup.origamiServicesStarted = true;
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

function retryStartup() {
  if (globalForStartup.origamiStartupRetry || globalForStartup.origamiServicesStarted) {
    return;
  }
  globalForStartup.origamiStartupRetry = setTimeout(() => {
    globalForStartup.origamiStartupRetry = undefined;
    void connectAndStart();
  }, RETRY_MS);
  globalForStartup.origamiStartupRetry.unref?.();
}

async function connectAndStart() {
  const { logIfDatabaseUnreachable, pingDatabase } = await import("@/lib/db");
  try {
    await pingDatabase();
  } catch (error) {
    if (logIfDatabaseUnreachable(error)) {
      retryStartup();
      return;
    }
    console.error("[origami] database check failed", error);
    return;
  }
  await startServices();
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installLogCapture } = await import("@/lib/settings/log");
  installLogCapture();
  await connectAndStart();
}
