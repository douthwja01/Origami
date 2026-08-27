"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileBrowser } from "@/components/FileBrowser";
import { useProjects } from "@/components/ProjectsContext";
import { formatBytes, kindLabel, statusLabel } from "@/lib/format";
import {
  parseProjectView,
  projectViewHref,
  type ProjectView,
} from "@/lib/project-view";
import {
  PROJECT_ASSET_KINDS,
  type AssetDTO,
  type AssetKind,
  type FolderDTO,
  type ProjectDTO,
  type TagDTO,
} from "@/lib/types";

type TabId = ProjectView;

type Props = {
  projectId: string;
  assets: AssetDTO[];
  folders: FolderDTO[];
  folds: ProjectDTO[];
  tags: TagDTO[];
  onChanged: () => Promise<void>;
  onNewFold: () => void;
};

export function VaultExplorer({
  projectId,
  assets,
  folders,
  folds,
  tags,
  onChanged,
  onNewFold,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects } = useProjects();
  const tab = parseProjectView(searchParams.get("view"));
  const projectCode =
    projects.find((project) => project.id === projectId)?.code ?? "Vault";

  const { counts, sizes, totalBytes } = useMemo(() => {
    const counts: Record<AssetKind, number> = {
      media: 0,
      code: 0,
      document: 0,
      cad: 0,
      backup: 0,
    };
    const sizes: Record<AssetKind, number> = {
      media: 0,
      code: 0,
      document: 0,
      cad: 0,
      backup: 0,
    };
    let totalBytes = 0;
    for (const asset of assets) {
      const bytes = Number(asset.sizeBytes) || 0;
      counts[asset.kind] += 1;
      sizes[asset.kind] += bytes;
      totalBytes += bytes;
    }
    return { counts, sizes, totalBytes };
  }, [assets]);

  const kindFolder = (PROJECT_ASSET_KINDS as readonly string[]).includes(tab)
    ? (tab as AssetKind)
    : null;

  const recent = useMemo(
    () =>
      [...assets]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    [assets],
  );

  function openTab(next: TabId) {
    if (tab !== next) {
      router.push(projectViewHref(projectId, next), { scroll: false });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <nav className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_0_var(--color-line)]">
        <Tab
          label="Files"
          count={assets.length}
          active={tab === "overview"}
          onClick={() => openTab("overview")}
        />
        {PROJECT_ASSET_KINDS.map((kind) => (
          <Tab
            key={kind}
            label={kindLabel(kind)}
            count={counts[kind]}
            active={tab === kind}
            onClick={() => openTab(kind)}
          />
        ))}
        <Tab
          label="Folds"
          count={folds.length}
          active={tab === "folds"}
          onClick={() => openTab("folds")}
        />
        <Tab
          label="Statistics"
          active={tab === "stats"}
          onClick={() => openTab("stats")}
        />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "stats" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
              <RecentFilesCard
                recent={recent}
                onOpenFile={() => openTab("overview")}
              />
              <StatisticsCard
                counts={counts}
                sizes={sizes}
                totalBytes={totalBytes}
                onOpenTab={openTab}
              />
            </div>
          </div>
        ) : tab === "folds" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-raised">
            <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
              <div className="min-w-0 flex-1 text-[12px] text-muted">Folds</div>
              <button
                type="button"
                onClick={onNewFold}
                className="rounded-md bg-accent px-2.5 py-1 text-[12px] text-canvas"
              >
                New fold
              </button>
            </header>
            <FoldsPanel folds={folds} />
          </div>
        ) : (
          <FileBrowser
            projectId={projectId}
            assets={assets}
            folders={folders}
            tags={tags}
            rootLabel={projectCode}
            filterKind={kindFolder ?? undefined}
            onChanged={onChanged}
          />
        )}
      </div>

      {tab !== "folds" ? (
        <FoldsCard folds={folds} onNewFold={onNewFold} />
      ) : null}
    </div>
  );
}

function Tab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-[13px] ${
        active
          ? "border-accent text-ink"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span className="font-mono text-[11px] text-muted">{count}</span>
      ) : null}
    </button>
  );
}

function StatisticsCard({
  counts,
  sizes,
  totalBytes,
  onOpenTab,
}: {
  counts: Record<AssetKind, number>;
  sizes: Record<AssetKind, number>;
  totalBytes: number;
  onOpenTab: (tab: TabId) => void;
}) {
  const totalFiles = PROJECT_ASSET_KINDS.reduce(
    (sum, kind) => sum + counts[kind],
    0,
  );

  return (
    <section className="rounded-xl border border-line bg-raised">
      <div className="flex items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-[13px] font-medium">Statistics</h2>
        <span className="font-mono text-[11px] text-muted">
          {totalFiles} {totalFiles === 1 ? "file" : "files"} ·{" "}
          {formatBytes(totalBytes)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
        {PROJECT_ASSET_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onOpenTab(kind)}
            className="rounded-lg border border-line bg-canvas px-3 py-2.5 text-left hover:border-accent/50"
          >
            <div className="text-[12px] text-muted">{kindLabel(kind)}</div>
            <div className="mt-1 font-mono text-[16px] tracking-tight text-ink">
              {counts[kind]}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">
              {formatBytes(sizes[kind])}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecentFilesCard({
  recent,
  onOpenFile,
}: {
  recent: AssetDTO[];
  onOpenFile: (asset: AssetDTO) => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-raised">
      <div className="px-4 py-3">
        <h2 className="text-[13px] font-medium">Recent files</h2>
      </div>
      {recent.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
          Nothing in the vault yet. Open Files to upload.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {recent.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onOpenFile(asset)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-overlay/60"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {asset.filename}
                </span>
                <span className="shrink-0 text-[12px] text-muted">
                  {kindLabel(asset.kind)}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {formatBytes(asset.sizeBytes)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FoldsPanel({ folds }: { folds: ProjectDTO[] }) {
  if (folds.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-[13px] text-muted">
        No folds yet.
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto p-3 lg:p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
        {folds.map((fold) => (
          <Link
            key={fold.id}
            href={`/projects/${fold.id}`}
            className="block rounded-lg border border-line bg-canvas px-3 py-2.5 hover:border-accent/50"
          >
            <div className="font-mono text-[11px] text-muted">{fold.code}</div>
            <div className="truncate text-[13px] text-ink">{fold.title}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
              <span className={`status-dot ${fold.status}`} />
              {statusLabel(fold.status)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FoldsCard({
  folds,
  onNewFold,
}: {
  folds: ProjectDTO[];
  onNewFold: () => void;
}) {
  return (
    <section className="shrink-0 rounded-xl border border-line bg-raised">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[13px] font-medium">Folds</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted">{folds.length}</span>
          <button
            type="button"
            onClick={onNewFold}
            className="text-[12px] text-muted hover:text-ink"
          >
            New
          </button>
        </div>
      </div>
      {folds.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
          No folds yet.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2 border-t border-line p-3 lg:p-4">
          {folds.map((fold) => (
            <Link
              key={fold.id}
              href={`/projects/${fold.id}`}
              className="block rounded-lg border border-line bg-canvas px-3 py-2.5 hover:border-accent/50"
            >
              <div className="font-mono text-[11px] text-muted">{fold.code}</div>
              <div className="truncate text-[13px] text-ink">{fold.title}</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                <span className={`status-dot ${fold.status}`} />
                {statusLabel(fold.status)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
