import { backupRoot, backupStats, getBackupSettings, listProjectBackups } from "@/lib/backup";
import { formatBytes } from "@/lib/format";
import { SETTINGS_NAV } from "@/lib/settings";
import { BackupSettings } from "@/components/BackupSettings";

export const dynamic = "force-dynamic";

export default async function BackupsPage() {
  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/backups");
  const [stats, settings, runs] = await Promise.all([
    backupStats(),
    getBackupSettings(),
    listProjectBackups(),
  ]);

  return (
    <main className="px-5 py-6 lg:px-8">
      <h1 className="text-[22px] font-medium tracking-tight">Backups</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        {item?.description}. A full archive includes an{" "}
        <span className="font-mono text-[12px]">origami-backup.json</span>{" "}
        snapshot of every project and file record, plus the vault folder.
      </p>

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
          <a
            href="/api/settings/backups/download"
            className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-[13px] font-bold !text-white hover:bg-accent-dim"
          >
            Download backup
          </a>
        </div>
      </section>

      <BackupSettings
        initialSettings={settings}
        backupDir={backupRoot()}
        runs={runs}
      />
    </main>
  );
}
