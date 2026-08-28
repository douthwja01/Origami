import { scanVault } from "@/lib/vault/scan";

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 5_000;

const globalForScan = globalThis as unknown as {
  origamiVaultScanTimer?: ReturnType<typeof setInterval>;
  origamiVaultScanChain?: Promise<void>;
};

function scanIntervalMs(): number | null {
  const raw = process.env.ORIGAMI_VAULT_SCAN_MS;
  if (raw === undefined || raw === "") return DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_INTERVAL_MS;
  if (n === 0) return null;
  return Math.max(MIN_INTERVAL_MS, n);
}

async function reconcileOnce(options: { immediate?: boolean }): Promise<void> {
  try {
    await scanVault(options);
  } catch (error) {
    console.error("[origami] vault scan failed", error);
  }
  try {
    const { scanBackups } = await import("@/lib/backups/scan");
    await scanBackups(options);
  } catch (error) {
    console.error("[origami] backup scan failed", error);
  }
}

/** Run vault and backup scans, waiting if another scan is already in progress. */
export function runStorageReconcile(
  options: { immediate?: boolean } = {},
): Promise<void> {
  const prior = globalForScan.origamiVaultScanChain ?? Promise.resolve();
  const next = prior.then(
    () => reconcileOnce(options),
    () => reconcileOnce(options),
  );
  globalForScan.origamiVaultScanChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function startVaultScanner() {
  if (globalForScan.origamiVaultScanTimer) return;
  const intervalMs = scanIntervalMs();
  if (intervalMs === null) {
    console.info("[origami] vault scanner disabled");
    return;
  }
  console.info("[origami] vault and backup scanner started");
  globalForScan.origamiVaultScanTimer = setInterval(() => {
    void runStorageReconcile();
  }, intervalMs);
  globalForScan.origamiVaultScanTimer.unref?.();
}
