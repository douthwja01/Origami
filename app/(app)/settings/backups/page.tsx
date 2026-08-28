import { backupRoot, backupStats, getBackupSettings, listProjectBackups } from "@/lib/backups/backup";
import { scanBackups } from "@/lib/backups/scan";
import { formatBytes } from "@/lib/shared/format";
import { SETTINGS_NAV } from "@/lib/settings/nav";
import { BackupSettings } from "@/components/settings/BackupSettings";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

export const dynamic = "force-dynamic";

export default async function BackupsPage() {
  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/backups");
  await scanBackups({ immediate: true }).catch((error) => {
    console.error("[origami] backup scan failed", error);
  });
  const [stats, settings, runs] = await Promise.all([
    backupStats(),
    getBackupSettings(),
    listProjectBackups(),
  ]);

  return (
    <SettingsPageShell
      href="/settings/backups"
      title="Backups"
      description={
        <>
          {item?.description}. A full archive includes an{" "}
          <span className="font-mono text-[12px]">origami-backup.json</span>{" "}
          snapshot of every project and file record, plus the vault folder.
        </>
      }
    >
      <section className="mt-6 flex max-w-2xl flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Download everything</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted">
              Projects
            </dt>
            <dd className="mt-1 font-mono">{stats.projectCount}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted">
              Files
            </dt>
            <dd className="mt-1 font-mono">{stats.assetCount}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted">
              Vault
            </dt>
            <dd className="mt-1 font-mono">{formatBytes(stats.vaultBytes)}</dd>
          </div>
        </dl>
        <div className="mt-4 flex justify-end">
          <a href="/api/settings/backups/download" className="btn-accent">
            Download backup
          </a>
        </div>
      </section>

      <BackupSettings
        initialSettings={settings}
        backupDir={backupRoot()}
        runs={runs}
      />
    </SettingsPageShell>
  );
}
