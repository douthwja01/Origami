"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AssetPreview } from "@/components/AssetPreview";
import { formatBytes, formatDate, kindLabel, statusLabel } from "@/lib/format";
import { mimeFromFilename } from "@/lib/kinds";
import {
  parseProjectView,
  projectViewHref,
  type ProjectView,
} from "@/lib/project-view";
import {
  ASSET_KINDS,
  type AssetDTO,
  type AssetKind,
  type ProjectDTO,
} from "@/lib/types";

const ASSET_DRAG = "application/x-origami-asset";

type TabId = ProjectView;

type Props = {
  projectId: string;
  assets: AssetDTO[];
  nested: ProjectDTO[];
  onChanged: () => Promise<void>;
  onNewChild: () => void;
};

export function VaultExplorer({
  projectId,
  assets,
  nested,
  onChanged,
  onNewChild,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tab = parseProjectView(searchParams.get("view"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AssetDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const next: Record<AssetKind, number> = {
      media: 0,
      code: 0,
      document: 0,
      cad: 0,
    };
    for (const asset of assets) next[asset.kind] += 1;
    return next;
  }, [assets]);

  const kindFolder = ASSET_KINDS.includes(tab as AssetKind)
    ? (tab as AssetKind)
    : null;

  const visible = useMemo(
    () =>
      kindFolder
        ? assets
            .filter((asset) => asset.kind === kindFolder)
            .sort((a, b) => a.filename.localeCompare(b.filename))
        : [],
    [assets, kindFolder],
  );

  const selected = useMemo(() => {
    if (!kindFolder) return null;
    if (!selectedId) return visible[0] ?? null;
    return visible.find((asset) => asset.id === selectedId) ?? visible[0] ?? null;
  }, [kindFolder, selectedId, visible]);

  const recent = useMemo(
    () =>
      [...assets]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    [assets],
  );

  async function uploadFiles(files: FileList | File[], kind: AssetKind) {
    setError(null);
    let last: AssetDTO | null = null;
    for (const file of Array.from(files)) {
      setUploading(file.name);
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const res = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to upload ${file.name}`);
        break;
      }
      last = data.asset;
    }
    setUploading(null);
    if (last) {
      setSelectedId(last.id);
      openTab(last.kind);
    }
    await onChanged();
    return last;
  }

  async function moveAsset(assetId: string, kind: AssetKind) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset || asset.kind === kind) return;
    setError(null);
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not move file");
      return;
    }
    setSelectedId(assetId);
    openTab(kind);
    await onChanged();
  }

  useEffect(() => {
    if (!creating && !pendingDelete) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreating(false);
        setPendingDelete(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, pendingDelete]);

  async function createFile() {
    if (!kindFolder) return;
    const filename = newName.trim();
    if (!filename || /[\\/]/.test(filename)) {
      setError("Enter a file name without path separators");
      return;
    }
    setBusy(true);
    setError(null);
    const file = new File([""], filename, { type: mimeFromFilename(filename) });
    const created = await uploadFiles([file], kindFolder);
    setBusy(false);
    if (created) {
      setCreating(false);
      setNewName("");
    }
  }

  async function remove(asset: AssetDTO) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    if (selectedId === asset.id) setSelectedId(null);
    setPendingDelete(null);
    await onChanged();
  }

  function handleDrop(target: AssetKind, event: React.DragEvent) {
    event.preventDefault();
    setDropTarget(null);
    const assetId =
      event.dataTransfer.getData(ASSET_DRAG) ||
      event.dataTransfer.getData("text/plain");
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      void moveAsset(assetId, target);
      return;
    }
    if (event.dataTransfer.files.length) {
      openTab(target);
      void uploadFiles(event.dataTransfer.files, target);
    }
  }

  function allowDrop(target: AssetKind, event: React.DragEvent) {
    const types = [...event.dataTransfer.types];
    const hasFiles = types.includes("Files");
    const hasAsset = types.includes(ASSET_DRAG) || types.includes("text/plain");
    if (hasFiles || hasAsset) {
      event.preventDefault();
      event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
      setDropTarget(target);
    }
  }

  function openTab(next: TabId) {
    if (tab !== next) {
      router.push(projectViewHref(projectId, next), { scroll: false });
    }
  }

  return (
    <div
      className={
        tab === "overview"
          ? "flex flex-col gap-3 pb-4"
          : "flex h-full min-h-0 flex-col"
      }
    >
      {tab === "overview" ? (
        <>
          <nav className="flex shrink-0 items-end gap-1 overflow-x-auto rounded-xl border border-line bg-raised px-2 md:hidden">
            <MobileVaultTabs
              tab={tab}
              counts={counts}
              nestedCount={nested.length}
              dropTarget={dropTarget}
              onOpenTab={openTab}
              allowDrop={allowDrop}
              handleDrop={handleDrop}
              setDropTarget={setDropTarget}
            />
          </nav>
          {error ? (
            <p className="text-[12px] text-accent">{error}</p>
          ) : null}
          {uploading ? (
            <p className="text-[12px] text-muted">Uploading {uploading}…</p>
          ) : null}
          <StatisticsCard
            counts={counts}
            dropTarget={dropTarget}
            onOpenTab={openTab}
            allowDrop={allowDrop}
            handleDrop={handleDrop}
            setDropTarget={setDropTarget}
          />
          <RecentFilesCard
            recent={recent}
            onOpenFile={(asset) => {
              setSelectedId(asset.id);
              openTab(asset.kind);
            }}
          />
          <ChildProjectsCard nested={nested} onNewChild={onNewChild} />
        </>
      ) : (
      <div className="flex h-full min-h-0 min-h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-raised">
      <nav className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-line px-2 md:hidden">
            <MobileVaultTabs
              tab={tab}
              counts={counts}
              nestedCount={nested.length}
              dropTarget={dropTarget}
              onOpenTab={openTab}
              allowDrop={allowDrop}
              handleDrop={handleDrop}
              setDropTarget={setDropTarget}
            />
      </nav>

        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <div className="min-w-0 flex-1 text-[12px] text-muted">
            {tab === "nested" ? "Nested projects" : kindLabel(tab)}
          </div>
          {tab === "nested" ? (
            <button
              type="button"
              onClick={onNewChild}
              className="rounded-md bg-accent px-2.5 py-1 text-[12px] text-canvas"
            >
              New project
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setNewName("");
                  setCreating(true);
                }}
                className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:border-accent"
              >
                New file
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:border-accent"
              >
                Upload
              </button>
              <button
                type="button"
                disabled={!selected}
                onClick={() => selected && setPendingDelete(selected)}
                className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Delete
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (kindFolder && event.target.files?.length) {
                void uploadFiles(event.target.files, kindFolder);
              }
              event.target.value = "";
            }}
          />
        </header>

      {error ? (
        <p className="shrink-0 px-3 py-2 text-[12px] text-accent">{error}</p>
      ) : null}
      {uploading ? (
        <p className="shrink-0 px-3 py-2 text-[12px] text-muted">
          Uploading {uploading}…
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "nested" ? (
          <NestedList nested={nested} />
        ) : (
          <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div
              className={`min-h-0 overflow-auto border-b border-line lg:border-b-0 lg:border-r ${
                dropTarget === kindFolder ? "bg-overlay/70" : ""
              }`}
              onDragOver={(event) => kindFolder && allowDrop(kindFolder, event)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setDropTarget((current) =>
                    current === kindFolder ? null : current,
                  );
                }
              }}
              onDrop={(event) => kindFolder && handleDrop(kindFolder, event)}
            >
              {visible.length === 0 ? (
                <EmptyPane
                  text={
                    dropTarget === kindFolder
                      ? `Drop to add files to ${kindLabel(tab)}`
                      : "Empty folder. Drop files here, or use New file / Upload."
                  }
                />
              ) : (
                <ul>
                  {visible.map((asset) => (
                    <li key={asset.id}>
                      <div
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(ASSET_DRAG, asset.id);
                          event.dataTransfer.setData("text/plain", asset.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDraggingId(asset.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                        className={`flex items-center gap-2 px-3 py-2 ${
                          selected?.id === asset.id
                            ? "bg-overlay"
                            : "hover:bg-overlay/60"
                        } ${draggingId === asset.id ? "opacity-50" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(asset.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-[13px]">{asset.filename}</div>
                          <div className="font-mono text-[11px] text-muted">
                            {formatBytes(asset.sizeBytes)}
                          </div>
                        </button>
                        <a
                          href={`/api/assets/${asset.id}?download=1`}
                          className="shrink-0 text-[11px] text-muted hover:text-ink"
                        >
                          Download
                        </a>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(asset)}
                          className="shrink-0 text-[11px] text-muted hover:text-accent"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-h-[280px] min-w-0 overflow-auto">
              {selected ? (
                <AssetPreview asset={selected} />
              ) : (
                <EmptyPane text="Select a file to preview, or drop files into this folder." />
              )}
            </div>
          </div>
        )}
      </div>
      </div>
      )}

      {creating && kindFolder ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[18vh]">
          <form
            className="w-full max-w-md rounded-xl border border-line bg-raised p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void createFile();
            }}
          >
            <h2 className="text-[16px] font-medium">New file</h2>
            <p className="mt-1 text-[13px] text-muted">
              Creates an empty file in {kindLabel(kindFolder)}.
            </p>
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={placeholderFor(kindFolder)}
              className="mt-4 w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-3 py-2 text-[13px] text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="rounded-md bg-accent px-3 py-2 text-[13px] text-canvas disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[18vh]">
          <div className="w-full max-w-md rounded-xl border border-line bg-raised p-5">
            <h2 className="text-[16px] font-medium">Delete file?</h2>
            <p className="mt-2 text-[13px] text-muted">
              {pendingDelete.filename} will be removed from the vault.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3 py-2 text-[13px] text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(pendingDelete)}
                className="rounded-md bg-accent px-3 py-2 text-[13px] text-canvas"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tab({
  label,
  count,
  active,
  dropActive,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  label: string;
  count?: number;
  active: boolean;
  dropActive?: boolean;
  onClick: () => void;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] ${
        active
          ? "border-accent text-ink"
          : "border-transparent text-muted hover:text-ink"
      } ${dropActive ? "bg-overlay" : ""}`}
    >
      {label}
      {count !== undefined ? (
        <span className="font-mono text-[11px] text-muted">{count}</span>
      ) : null}
    </button>
  );
}

function MobileVaultTabs({
  tab,
  counts,
  nestedCount,
  dropTarget,
  onOpenTab,
  allowDrop,
  handleDrop,
  setDropTarget,
}: {
  tab: TabId;
  counts: Record<AssetKind, number>;
  nestedCount: number;
  dropTarget: string | null;
  onOpenTab: (next: TabId) => void;
  allowDrop: (target: AssetKind, event: React.DragEvent) => void;
  handleDrop: (target: AssetKind, event: React.DragEvent) => void;
  setDropTarget: (value: string | null | ((current: string | null) => string | null)) => void;
}) {
  return (
    <>
      <Tab
        label="Overview"
        active={tab === "overview"}
        onClick={() => onOpenTab("overview")}
      />
      {ASSET_KINDS.map((kind) => (
        <Tab
          key={kind}
          label={kindLabel(kind)}
          count={counts[kind]}
          active={tab === kind}
          dropActive={dropTarget === kind}
          onClick={() => onOpenTab(kind)}
          onDragOver={(event) => allowDrop(kind, event)}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDropTarget((current) => (current === kind ? null : current));
            }
          }}
          onDrop={(event) => handleDrop(kind, event)}
        />
      ))}
      <Tab
        label="Projects"
        count={nestedCount}
        active={tab === "nested"}
        onClick={() => onOpenTab("nested")}
      />
    </>
  );
}

function StatisticsCard({
  counts,
  dropTarget,
  onOpenTab,
  allowDrop,
  handleDrop,
  setDropTarget,
}: {
  counts: Record<AssetKind, number>;
  dropTarget: string | null;
  onOpenTab: (tab: TabId) => void;
  allowDrop: (target: AssetKind, event: React.DragEvent) => void;
  handleDrop: (target: AssetKind, event: React.DragEvent) => void;
  setDropTarget: (value: string | null | ((current: string | null) => string | null)) => void;
}) {
  const totalFiles = ASSET_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

  return (
    <section className="shrink-0 rounded-xl border border-line bg-raised">
      <div className="flex items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-[13px] font-medium">Statistics</h2>
        <span className="font-mono text-[11px] text-muted">
          {totalFiles} {totalFiles === 1 ? "file" : "files"}
        </span>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {ASSET_KINDS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              onClick={() => onOpenTab(kind)}
              onDragOver={(event) => allowDrop(kind, event)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setDropTarget((current) =>
                    current === kind ? null : current,
                  );
                }
              }}
              onDrop={(event) => handleDrop(kind, event)}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-overlay/60 ${
                dropTarget === kind ? "bg-overlay" : ""
              }`}
            >
              <span className="text-[13px] text-ink">{kindLabel(kind)}</span>
              <span className="font-mono text-[12px] text-muted">
                {counts[kind]}
              </span>
            </button>
          </li>
        ))}
      </ul>
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
    <section className="shrink-0 rounded-xl border border-line bg-raised">
      <div className="px-4 py-3">
        <h2 className="text-[13px] font-medium">Recent files</h2>
      </div>
      {recent.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
          Nothing in the vault yet. Open a folder tab to upload.
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

function ChildProjectsCard({
  nested,
  onNewChild,
}: {
  nested: ProjectDTO[];
  onNewChild: () => void;
}) {
  return (
    <section className="shrink-0 rounded-xl border border-line bg-raised">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[13px] font-medium">Child projects</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted">{nested.length}</span>
          <button
            type="button"
            onClick={onNewChild}
            className="text-[12px] text-muted hover:text-ink"
          >
            New
          </button>
        </div>
      </div>
      {nested.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
          No child projects yet.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2 border-t border-line p-3 lg:p-4">
          {nested.map((child) => (
            <Link
              key={child.id}
              href={`/projects/${child.id}`}
              className="block rounded-lg border border-line bg-canvas px-3 py-2.5 hover:border-accent/50"
            >
              <div className="font-mono text-[11px] text-muted">{child.code}</div>
              <div className="truncate text-[13px] text-ink">{child.title}</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                <span className={`status-dot ${child.status}`} />
                {statusLabel(child.status)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function NestedList({ nested }: { nested: ProjectDTO[] }) {
  if (nested.length === 0) {
    return <EmptyPane text="No nested projects yet." />;
  }
  return (
    <ul className="h-full overflow-auto">
      {nested.map((child) => (
        <li key={child.id}>
          <Link
            href={`/projects/${child.id}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-overlay/60"
          >
            <span className={`status-dot ${child.status}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{child.title}</span>
              <span className="block font-mono text-[11px] text-muted">
                {child.code} · {formatDate(child.startDate)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function placeholderFor(kind: AssetKind): string {
  switch (kind) {
    case "media":
      return "photo.png";
    case "code":
      return "main.ts";
    case "cad":
      return "part.stl";
    default:
      return "notes.md";
  }
}

function EmptyPane({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-[13px] text-muted">
      {text}
    </div>
  );
}
