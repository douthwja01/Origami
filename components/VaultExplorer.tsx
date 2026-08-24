"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AssetPreview } from "@/components/AssetPreview";
import { formatBytes, formatDate, kindLabel } from "@/lib/format";
import { mimeFromFilename } from "@/lib/kinds";
import {
  ASSET_KINDS,
  type AssetDTO,
  type AssetKind,
  type ProjectDTO,
} from "@/lib/types";

const ASSET_DRAG = "application/x-origami-asset";

type TabId = "overview" | AssetKind | "nested";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>("overview");
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
      setTab(last.kind);
      setSelectedId(last.id);
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
    setTab(kind);
    setSelectedId(assetId);
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
      setTab(target);
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
    setTab(next);
    if (next !== kindFolder) setSelectedId(null);
  }

  return (
    <div className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-xl border border-line bg-raised">
      <nav className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-line px-2">
        <Tab
          label="Overview"
          active={tab === "overview"}
          onClick={() => openTab("overview")}
        />
        {ASSET_KINDS.map((kind) => (
          <Tab
            key={kind}
            label={kindLabel(kind)}
            count={counts[kind]}
            active={tab === kind}
            dropActive={dropTarget === kind}
            onClick={() => openTab(kind)}
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
          count={nested.length}
          active={tab === "nested"}
          onClick={() => openTab("nested")}
        />
      </nav>

      {tab !== "overview" ? (
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
      ) : null}

      {error ? (
        <p className="shrink-0 px-3 py-2 text-[12px] text-accent">{error}</p>
      ) : null}
      {uploading ? (
        <p className="shrink-0 px-3 py-2 text-[12px] text-muted">
          Uploading {uploading}…
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "overview" ? (
          <Overview
            counts={counts}
            nested={nested}
            recent={recent}
            dropTarget={dropTarget}
            onOpenTab={openTab}
            onOpenFile={(asset) => {
              setTab(asset.kind);
              setSelectedId(asset.id);
            }}
            onNewChild={onNewChild}
            allowDrop={allowDrop}
            handleDrop={handleDrop}
            setDropTarget={setDropTarget}
          />
        ) : tab === "nested" ? (
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

function Overview({
  counts,
  nested,
  recent,
  dropTarget,
  onOpenTab,
  onOpenFile,
  onNewChild,
  allowDrop,
  handleDrop,
  setDropTarget,
}: {
  counts: Record<AssetKind, number>;
  nested: ProjectDTO[];
  recent: AssetDTO[];
  dropTarget: string | null;
  onOpenTab: (tab: TabId) => void;
  onOpenFile: (asset: AssetDTO) => void;
  onNewChild: () => void;
  allowDrop: (target: AssetKind, event: React.DragEvent) => void;
  handleDrop: (target: AssetKind, event: React.DragEvent) => void;
  setDropTarget: (value: string | null | ((current: string | null) => string | null)) => void;
}) {
  const totalFiles = ASSET_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

  return (
    <div className="h-full overflow-auto p-4 lg:p-5">
      <p className="mb-4 text-[13px] text-muted">
        {totalFiles} {totalFiles === 1 ? "file" : "files"}
        {" · "}
        {nested.length} nested {nested.length === 1 ? "project" : "projects"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ASSET_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onOpenTab(kind)}
            onDragOver={(event) => allowDrop(kind, event)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDropTarget((current) => (current === kind ? null : current));
              }
            }}
            onDrop={(event) => handleDrop(kind, event)}
            className={`rounded-lg border px-3 py-3 text-left hover:border-accent ${
              dropTarget === kind ? "border-accent bg-overlay" : "border-line"
            }`}
          >
            <div className="text-[13px] text-ink">{kindLabel(kind)}</div>
            <div className="mt-1 font-mono text-[12px] text-muted">
              {counts[kind]} {counts[kind] === 1 ? "file" : "files"}
            </div>
          </button>
        ))}
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-medium">Nested projects</h2>
          <button
            type="button"
            onClick={onNewChild}
            className="text-[12px] text-muted hover:text-ink"
          >
            New
          </button>
        </div>
        {nested.length === 0 ? (
          <p className="text-[13px] text-muted">No nested projects yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
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
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[13px] font-medium">Recent files</h2>
        {recent.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nothing in the vault yet. Open a folder tab to upload.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {recent.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => onOpenFile(asset)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-overlay/60"
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
    </div>
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
