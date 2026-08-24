import { backupStats } from "@/lib/backup";
import { formatBytes } from "@/lib/format";
import { SETTINGS_NAV } from "@/lib/settings";

export default async function BackupsPage() {
  const stats = await backupStats();
  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/backups");

  return (
    <main className="px-5 py-6 lg:px-8">
      <h1 className="text-[22px] font-medium tracking-tight">Backups</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        {item?.description}. The archive includes an{" "}
        <span className="font-mono text-[12px]">origami-backup.json</span>{" "}
        snapshot of every project and file record, plus the vault folder.
      </p>

      <section className="mt-6 max-w-xl rounded-xl border border-line bg-raised p-4">
        <dl className="grid grid-cols-3 gap-3 text-[13px]">
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
        <a
          href="/api/settings/backups/download"
          className="mt-4 inline-flex rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-canvas hover:bg-accent-dim"
        >
          Download backup
        </a>
      </section>
    </main>
  );
}
