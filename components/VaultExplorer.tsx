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

type FolderId = AssetKind | "nested";

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
  const [folder, setFolder] = useState<FolderId | null>(null);
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

  const activeFolder: FolderId =
    folder ??
    ASSET_KINDS.find((kind) => assets.some((asset) => asset.kind === kind)) ??
    "media";

  const visible = useMemo(
    () =>
      activeFolder === "nested"
        ? []
        : assets
            .filter((asset) => asset.kind === activeFolder)
            .sort((a, b) => a.filename.localeCompare(b.filename)),
    [assets, activeFolder],
  );

  const selected = useMemo(() => {
    if (!selectedId) return visible[0] ?? null;
    return visible.find((asset) => asset.id === selectedId) ?? visible[0] ?? null;
  }, [selectedId, visible]);

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
      setFolder(last.kind);
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
    setFolder(kind);
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
    if (activeFolder === "nested") return;
    const filename = newName.trim();
    if (!filename || /[\\/]/.test(filename)) {
      setError("Enter a file name without path separators");
      return;
    }
    setBusy(true);
    setError(null);
    const file = new File([""], filename, { type: mimeFromFilename(filename) });
    const created = await uploadFiles([file], activeFolder);
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

  function handleDrop(target: FolderId, event: React.DragEvent) {
    event.preventDefault();
    setDropTarget(null);
    if (target === "nested") return;
    const assetId =
      event.dataTransfer.getData(ASSET_DRAG) ||
      event.dataTransfer.getData("text/plain");
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      void moveAsset(assetId, target);
      return;
    }
    if (event.dataTransfer.files.length) {
      setFolder(target);
      void uploadFiles(event.dataTransfer.files, target);
    }
  }

  function allowDrop(target: FolderId, event: React.DragEvent) {
    const hasFiles = [...event.dataTransfer.types].includes("Files");
    const hasAsset =
      [...event.dataTransfer.types].includes(ASSET_DRAG) ||
      [...event.dataTransfer.types].includes("text/plain");
    if (target === "nested") return;
    if (hasFiles || hasAsset) {
      event.preventDefault();
      event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
      setDropTarget(target);
    }
  }

  const kindFolder = activeFolder === "nested" ? null : activeFolder;

  return (
    <div className="grid h-full min-h-[32rem] overflow-hidden rounded-xl border border-line bg-raised lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.15fr)]">
      <nav className="min-h-0 overflow-auto border-b border-line p-2 lg:border-b-0 lg:border-r">
        <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted">
          Vault
        </div>
        {ASSET_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              setFolder(kind);
              setSelectedId(null);
            }}
            onDragOver={(event) => allowDrop(kind, event)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDropTarget((current) => (current === kind ? null : current));
              }
            }}
            onDrop={(event) => handleDrop(kind, event)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
              activeFolder === kind
                ? "bg-overlay text-ink"
                : "text-muted hover:bg-overlay/60 hover:text-ink"
            } ${dropTarget === kind ? "ring-1 ring-accent" : ""}`}
          >
            <FolderMark open={activeFolder === kind} />
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {kindLabel(kind)}
            </span>
            <span className="font-mono text-[11px] text-muted">{counts[kind]}</span>
          </button>
        ))}
        <div className="mt-3 px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted">
          Nested
        </div>
        <button
          type="button"
          onClick={() => {
            setFolder("nested");
            setSelectedId(null);
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
            activeFolder === "nested"
              ? "bg-overlay text-ink"
              : "text-muted hover:bg-overlay/60 hover:text-ink"
          }`}
        >
          <FolderMark open={activeFolder === "nested"} />
          <span className="min-w-0 flex-1 truncate text-[13px]">Projects</span>
          <span className="font-mono text-[11px] text-muted">{nested.length}</span>
        </button>
      </nav>

      <section className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <div className="min-w-0 flex-1 text-[12px] text-muted">
            {activeFolder === "nested" ? "Nested / Projects" : `Vault / ${kindLabel(activeFolder)}`}
          </div>
          {activeFolder === "nested" ? (
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

        <div
          className={`min-h-0 flex-1 overflow-auto ${
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
          {activeFolder === "nested" ? (
            nested.length === 0 ? (
              <EmptyPane text="No nested projects yet." />
            ) : (
              <ul>
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
            )
          ) : visible.length === 0 ? (
            <EmptyPane
              text={
                dropTarget === kindFolder
                  ? `Drop to add files to ${kindLabel(activeFolder)}`
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
                      selected?.id === asset.id ? "bg-overlay" : "hover:bg-overlay/60"
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
      </section>

      <section className="min-h-[280px] min-w-0 overflow-auto">
        {activeFolder === "nested" ? (
          <EmptyPane text="Open a nested project from the list." />
        ) : selected ? (
          <AssetPreview asset={selected} />
        ) : (
          <EmptyPane text="Select a file to preview, or drop files into this folder." />
        )}
      </section>

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

function FolderMark({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={open ? "text-accent" : "text-muted"}
    >
      <path
        d="M2.5 5.25h3.1l.85 1.2H13.5v6.05a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5V5.25Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M2.5 5.25V4.4c0-.28.22-.5.5-.5h3.05l.7.85"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
