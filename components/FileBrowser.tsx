"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AssetPreview } from "@/components/AssetPreview";
import { TagChips, TagContextMenu } from "@/components/TagMenu";
import { formatBytes, kindLabel, statusLabel } from "@/lib/format";
import {
  directChildFolderName,
  isUnderFolderPath,
  joinFolderPath,
} from "@/lib/folder-path";
import { mimeFromFilename } from "@/lib/kinds";
import {
  firstTagSortKey,
  itemMatchesTagQuery,
} from "@/lib/tag-utils";
import {
  type AssetDTO,
  type AssetKind,
  type FolderDTO,
  type ProjectDTO,
  type TagDTO,
} from "@/lib/types";

const ASSET_DRAG = "application/x-origami-asset";

type SortMode = "name" | "date" | "tags";

type Selection =
  | { type: "folder"; path: string }
  | { type: "file"; id: string }
  | { type: "projects" }
  | null;

type MenuState = {
  x: number;
  y: number;
  target: { type: "file"; id: string } | { type: "folder"; path: string };
};

type Props = {
  projectId: string;
  assets: AssetDTO[];
  folders: FolderDTO[];
  nested: ProjectDTO[];
  tags: TagDTO[];
  rootLabel?: string;
  filterKind?: AssetKind;
  onChanged: () => Promise<void>;
  onNewChild: () => void;
  onOpenProjects?: () => void;
};

export function FileBrowser({
  projectId,
  assets,
  folders,
  nested,
  tags: catalog,
  rootLabel = "Vault",
  filterKind,
  onChanged,
  onNewChild,
  onOpenProjects,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { type: "file"; asset: AssetDTO }
    | { type: "folder"; path: string }
    | null
  >(null);

  useEffect(() => {
    if (!creatingFile && !creatingFolder && !pendingDelete) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreatingFile(false);
        setCreatingFolder(false);
        setPendingDelete(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creatingFile, creatingFolder, pendingDelete]);

  const folderPaths = useMemo(() => {
    const set = new Set<string>();
    for (const folder of folders) set.add(folder.path);
    for (const asset of assets) {
      if (!asset.folderPath) continue;
      const parts = asset.folderPath.split("/");
      let built = "";
      for (const part of parts) {
        built = joinFolderPath(built, part);
        set.add(built);
      }
    }
    return set;
  }, [assets, folders]);

  const folderTagsOf = useMemo(() => {
    const map = new Map<string, TagDTO[]>();
    for (const folder of folders) map.set(folder.path, folder.tags);
    return map;
  }, [folders]);

  function tagsForFolder(folderPath: string): TagDTO[] {
    return folderTagsOf.get(folderPath) ?? [];
  }

  function folderHasKind(folderPath: string, kind: AssetKind): boolean {
    return assets.some(
      (asset) =>
        asset.kind === kind &&
        (asset.folderPath === folderPath ||
          isUnderFolderPath(asset.folderPath, folderPath)),
    );
  }

  const filtering = query.trim().length > 0 || Boolean(tagFilter);
  const activeTag = tagFilter
    ? catalog.find((tag) => tag.key === tagFilter) ?? null
    : null;

  const childFolders = useMemo(() => {
    const names = new Set<string>();
    for (const folderPath of folderPaths) {
      const child = directChildFolderName(folderPath, path);
      if (!child) continue;
      const full = joinFolderPath(path, child);
      if (filterKind && !folderHasKind(full, filterKind)) continue;
      names.add(child);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [assets, filterKind, folderPaths, path]);

  const childFiles = useMemo(() => {
    return assets
      .filter(
        (asset) =>
          asset.folderPath === path &&
          (!filterKind || asset.kind === filterKind),
      )
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }, [assets, filterKind, path]);

  const listedFolders = useMemo(() => {
    type Entry = {
      path: string;
      name: string;
      tags: TagDTO[];
      createdAt: string;
    };
    const entries: Entry[] = [];
    for (const folderPath of folderPaths) {
      if (filtering) {
        if (path && !isUnderFolderPath(folderPath, path)) continue;
        if (folderPath === path) continue;
        if (filterKind && !folderHasKind(folderPath, filterKind)) continue;
      } else {
        const child = directChildFolderName(folderPath, path);
        if (!child || joinFolderPath(path, child) !== folderPath) continue;
        if (filterKind && !folderHasKind(folderPath, filterKind)) continue;
      }
      const name = folderPath.split("/").pop() ?? folderPath;
      const tags = folderTagsOf.get(folderPath) ?? [];
      if (
        filtering &&
        !itemMatchesTagQuery(name, tags, query, tagFilter)
      ) {
        continue;
      }
      const createdAt =
        folders.find((folder) => folder.path === folderPath)?.createdAt ?? "";
      entries.push({ path: folderPath, name, tags, createdAt });
    }
    entries.sort((a, b) => {
      if (sort === "date") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "tags") {
        const tagCmp = firstTagSortKey(a.tags).localeCompare(
          firstTagSortKey(b.tags),
        );
        if (tagCmp !== 0) return tagCmp;
      }
      return a.name.localeCompare(b.name);
    });
    return entries;
  }, [
    assets,
    filterKind,
    filtering,
    folderPaths,
    folderTagsOf,
    folders,
    path,
    query,
    sort,
    tagFilter,
  ]);

  const listedFiles = useMemo(() => {
    const pool = assets.filter((asset) => {
      if (filterKind && asset.kind !== filterKind) return false;
      if (filtering) {
        return asset.folderPath === path || isUnderFolderPath(asset.folderPath, path);
      }
      return asset.folderPath === path;
    });
    const matched = pool.filter((asset) =>
      itemMatchesTagQuery(asset.filename, asset.tags, query, tagFilter),
    );
    return [...matched].sort((a, b) => {
      if (sort === "date") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "tags") {
        const tagCmp = firstTagSortKey(a.tags).localeCompare(
          firstTagSortKey(b.tags),
        );
        if (tagCmp !== 0) return tagCmp;
      }
      return a.filename.localeCompare(b.filename);
    });
  }, [assets, filterKind, filtering, path, query, sort, tagFilter]);

  const selectedFile = useMemo(() => {
    if (selection?.type !== "file") return null;
    return assets.find((asset) => asset.id === selection.id) ?? null;
  }, [assets, selection]);

  const selectedFolder = useMemo(() => {
    if (selection?.type !== "folder") return null;
    return {
      path: selection.path,
      name: selection.path.split("/").pop() ?? selection.path,
      tags: tagsForFolder(selection.path),
    };
  }, [folderTagsOf, selection]);

  const menuAssigned = useMemo(() => {
    if (!menu) return [] as TagDTO[];
    const target = menu.target;
    if (target.type === "file") {
      return assets.find((asset) => asset.id === target.id)?.tags ?? [];
    }
    return tagsForFolder(target.path);
  }, [assets, folderTagsOf, menu]);

  const deleteEnabled =
    selection?.type === "file" || selection?.type === "folder";
  const taggable = deleteEnabled;
  const headerLabel = filterKind ? kindLabel(filterKind) : rootLabel;

  function openFolder(nextPath: string) {
    setPath(nextPath);
    setSelection(null);
  }

  function goUp() {
    if (!path) return;
    const parts = path.split("/");
    parts.pop();
    setPath(parts.join("/"));
    setSelection(null);
  }

  function openItemMenu(
    event: React.MouseEvent,
    target: MenuState["target"],
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (target.type === "file") setSelection({ type: "file", id: target.id });
    else setSelection({ type: "folder", path: target.path });
    setMenu({ x: event.clientX, y: event.clientY, target });
  }

  async function saveTags(names: string[]) {
    if (!menu) return;
    setError(null);
    const res =
      menu.target.type === "file"
        ? await fetch(`/api/assets/${menu.target.id}/tags`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names }),
          })
        : await fetch(`/api/projects/${projectId}/folder-tags`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: menu.target.path,
              names,
            }),
          });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not update tags");
      return;
    }
    await onChanged();
  }

  function applyTagFilter(tag: TagDTO) {
    setTagFilter(tag.key);
  }

  async function uploadFiles(files: FileList | File[], folderPath: string) {
    setError(null);
    let last: AssetDTO | null = null;
    for (const file of Array.from(files)) {
      setUploading(file.name);
      const form = new FormData();
      form.append("file", file);
      form.append("folderPath", folderPath);
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
    if (last) setSelection({ type: "file", id: last.id });
    await onChanged();
    return last;
  }

  async function moveAsset(assetId: string, folderPath: string) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset || asset.folderPath === folderPath) return;
    setError(null);
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not move file");
      return;
    }
    setSelection({ type: "file", id: assetId });
    await onChanged();
  }

  async function createFile() {
    const filename = newName.trim();
    if (!filename || /[\\/]/.test(filename)) {
      setError("Enter a file name without path separators");
      return;
    }
    setBusy(true);
    setError(null);
    const file = new File([""], filename, { type: mimeFromFilename(filename) });
    const created = await uploadFiles([file], path);
    setBusy(false);
    if (created) {
      setCreatingFile(false);
      setNewName("");
    }
  }

  async function createFolder() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentPath: path,
        name: newName,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not create folder");
      return;
    }
    setCreatingFolder(false);
    setNewName("");
    setSelection({ type: "folder", path: data.folder.path });
    await onChanged();
  }

  async function removeSelection() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    if (pendingDelete.type === "file") {
      const res = await fetch(`/api/assets/${pendingDelete.asset.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setError(data.error || "Delete failed");
        return;
      }
      if (selection?.type === "file" && selection.id === pendingDelete.asset.id) {
        setSelection(null);
      }
    } else {
      const params = new URLSearchParams({ path: pendingDelete.path });
      const res = await fetch(
        `/api/projects/${projectId}/folders?${params}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setError(data.error || "Delete failed");
        return;
      }
      if (selection?.type === "folder" && selection.path === pendingDelete.path) {
        setSelection(null);
      }
    }
    setPendingDelete(null);
    await onChanged();
  }

  function handleFolderDrop(folderPath: string, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const assetId =
      event.dataTransfer.getData(ASSET_DRAG) ||
      event.dataTransfer.getData("text/plain");
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      void moveAsset(assetId, folderPath);
      return;
    }
    if (event.dataTransfer.files.length) {
      void uploadFiles(event.dataTransfer.files, folderPath);
    }
  }

  function allowFolderDrop(key: string, event: React.DragEvent) {
    const types = [...event.dataTransfer.types];
    const hasFiles = types.includes("Files");
    const hasAsset = types.includes(ASSET_DRAG) || types.includes("text/plain");
    if (hasFiles || hasAsset) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
      setDropTarget(key);
    }
  }

  const crumbs = [
    { label: headerLabel, onClick: () => { setPath(""); setSelection(null); } },
    ...((path ? path.split("/") : []).map((part, index, parts) => {
      const next = parts.slice(0, index + 1).join("/");
      return { label: part, onClick: () => openFolder(next) };
    })),
  ];

  const showProjects = !filterKind && !path && !filtering;
  const emptyTree =
    !filtering && childFolders.length === 0 && childFiles.length === 0 && !showProjects;
  const emptySearch =
    filtering && listedFolders.length === 0 && listedFiles.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-raised">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1" aria-hidden="true" />
        <button
          type="button"
          onClick={goUp}
          disabled={!path}
          className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:border-accent hover:text-ink disabled:opacity-40"
        >
          Up
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setNewName("");
            setCreatingFile(true);
          }}
          className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:border-accent"
        >
          New file
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setNewName("");
            setCreatingFolder(true);
          }}
          className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:border-accent"
        >
          New folder
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
          disabled={!taggable}
          onClick={(event) => {
            if (selection?.type === "file") {
              openItemMenu(event, { type: "file", id: selection.id });
            } else if (selection?.type === "folder") {
              openItemMenu(event, { type: "folder", path: selection.path });
            }
          }}
          className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:border-accent disabled:opacity-40"
        >
          Tags
        </button>
        <button
          type="button"
          disabled={!deleteEnabled}
          onClick={() => {
            if (selection?.type === "file") {
              const asset = assets.find((item) => item.id === selection.id);
              if (asset) setPendingDelete({ type: "file", asset });
            } else if (selection?.type === "folder") {
              setPendingDelete({ type: "folder", path: selection.path });
            }
          }}
          className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          Delete
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) {
              void uploadFiles(event.target.files, path);
            }
            event.target.value = "";
          }}
        />
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files and tags"
          className="min-w-[10rem] flex-1 rounded-md border border-line bg-canvas px-2.5 py-1 text-[12px] outline-none focus:border-accent"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
            className="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
          >
            <option value="name">Name</option>
            <option value="date">Newest</option>
            <option value="tags">Tags</option>
          </select>
        </label>
        {activeTag ? (
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className="badge badge-active"
          >
            {activeTag.name} ×
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="shrink-0 px-3 py-2 text-[12px] text-accent">{error}</p>
      ) : null}
      {uploading ? (
        <p className="shrink-0 px-3 py-2 text-[12px] text-muted">
          Uploading {uploading}…
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div
          className={`flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r ${
            dropTarget === path ? "bg-overlay/40" : ""
          }`}
          onDragOver={(event) => allowFolderDrop(path, event)}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDropTarget(null);
            }
          }}
          onDrop={(event) => handleFolderDrop(path, event)}
        >
          <nav
            aria-label="Folder path"
            className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-3 py-2 text-[12px]"
          >
            {crumbs.map((crumb, index) => (
              <span
                key={`${crumb.label}-${index}`}
                className="flex items-center gap-1"
              >
                {index > 0 ? <span className="text-muted">/</span> : null}
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className={
                    index === crumbs.length - 1
                      ? "font-mono text-ink"
                      : "font-mono text-muted hover:text-ink"
                  }
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-auto">
          {emptyTree ? (
            <EmptyPane text="Empty folder. Use New folder / New file / Upload, or drop files here." />
          ) : emptySearch ? (
            <EmptyPane text="No files or folders match this search." />
          ) : (
            <ul>
              {listedFolders.map((folder) => {
                const selected =
                  selection?.type === "folder" && selection.path === folder.path;
                return (
                  <li key={folder.path}>
                    <div
                      onContextMenu={(event) =>
                        openItemMenu(event, { type: "folder", path: folder.path })
                      }
                      onDragOver={(event) => allowFolderDrop(folder.path, event)}
                      onDragLeave={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node,
                          )
                        ) {
                          setDropTarget((current) =>
                            current === folder.path ? null : current,
                          );
                        }
                      }}
                      onDrop={(event) => handleFolderDrop(folder.path, event)}
                      className={`flex items-center gap-2 px-3 py-2 ${
                        selected ? "bg-overlay" : "hover:bg-overlay/60"
                      } ${dropTarget === folder.path ? "bg-overlay" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelection({ type: "folder", path: folder.path })
                        }
                        onDoubleClick={() => openFolder(folder.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <FolderIcon />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">
                            {folder.name}
                          </span>
                          {filtering && folder.path !== folder.name ? (
                            <span className="block truncate font-mono text-[11px] text-muted">
                              {folder.path}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <TagChips
                        tags={folder.tags}
                        compact
                        onTagClick={applyTagFilter}
                      />
                    </div>
                  </li>
                );
              })}
              {listedFiles.map((asset) => {
                const selected =
                  selection?.type === "file" && selection.id === asset.id;
                return (
                  <li key={asset.id}>
                    <div
                      draggable
                      onContextMenu={(event) =>
                        openItemMenu(event, { type: "file", id: asset.id })
                      }
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
                        selected ? "bg-overlay" : "hover:bg-overlay/60"
                      } ${draggingId === asset.id ? "opacity-50" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelection({ type: "file", id: asset.id })
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <FileIcon />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">
                            {asset.filename}
                          </span>
                          <span className="block font-mono text-[11px] text-muted">
                            {filtering && asset.folderPath
                              ? `${asset.folderPath} · ${formatBytes(asset.sizeBytes)}`
                              : formatBytes(asset.sizeBytes)}
                          </span>
                        </span>
                      </button>
                      <TagChips
                        tags={asset.tags}
                        compact
                        onTagClick={applyTagFilter}
                      />
                    </div>
                  </li>
                );
              })}
              {showProjects ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setSelection({ type: "projects" })}
                    onDoubleClick={() => onOpenProjects?.()}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                      selection?.type === "projects"
                        ? "bg-overlay"
                        : "hover:bg-overlay/60"
                    }`}
                  >
                    <FolderIcon />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      Projects
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {nested.length}
                    </span>
                  </button>
                </li>
              ) : null}
            </ul>
          )}
          </div>
        </div>

        <div className="min-h-[280px] min-w-0 overflow-auto">
          {selectedFile ? (
            <div className="flex h-full min-h-0 flex-col">
              {selectedFile.tags.length > 0 ? (
                <div className="border-b border-line px-4 py-2">
                  <TagChips
                    tags={selectedFile.tags}
                    onTagClick={applyTagFilter}
                  />
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                <AssetPreview asset={selectedFile} />
              </div>
            </div>
          ) : selection?.type === "folder" ? (
            <div className="p-4">
              <h2 className="text-[13px] font-medium">{selectedFolder?.name}</h2>
              <p className="mt-1 text-[13px] text-muted">
                Double-click to open, right-click to tag, or delete to remove it.
              </p>
              {selectedFolder && selectedFolder.tags.length > 0 ? (
                <div className="mt-3">
                  <TagChips
                    tags={selectedFolder.tags}
                    onTagClick={applyTagFilter}
                  />
                </div>
              ) : null}
            </div>
          ) : selection?.type === "projects" ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-medium">Child projects</h2>
                <button
                  type="button"
                  onClick={onNewChild}
                  className="text-[12px] text-muted hover:text-ink"
                >
                  New
                </button>
              </div>
              {nested.length === 0 ? (
                <p className="text-[13px] text-muted">No child projects yet.</p>
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
                          <span className="block truncate text-[13px]">
                            {child.title}
                          </span>
                          <span className="block font-mono text-[11px] text-muted">
                            {child.code} · {statusLabel(child.status)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <EmptyPane text="Select a file to preview, or open a folder." />
          )}
        </div>
      </div>

      {creatingFile ? (
        <NameDialog
          title="New file"
          hint={
            filterKind
              ? `Creates an empty file. Type is set from the name (${kindLabel(filterKind)} for matching extensions).`
              : "Creates an empty file. Media, Code, Documents, or CAD is assigned from the file extension."
          }
          value={newName}
          placeholder={placeholderFor(filterKind)}
          busy={busy}
          onChange={setNewName}
          onCancel={() => setCreatingFile(false)}
          onSubmit={() => void createFile()}
        />
      ) : null}

      {creatingFolder ? (
        <NameDialog
          title="New folder"
          hint="Creates a folder in the current location."
          value={newName}
          placeholder="folder-name"
          busy={busy}
          onChange={setNewName}
          onCancel={() => setCreatingFolder(false)}
          onSubmit={() => void createFolder()}
        />
      ) : null}

      {menu ? (
        <TagContextMenu
          x={menu.x}
          y={menu.y}
          assigned={menuAssigned}
          catalog={catalog}
          onSetNames={saveTags}
          onClose={() => setMenu(null)}
          onDownload={
            menu.target.type === "file"
              ? () => {
                  const target = menu.target;
                  if (target.type === "file") {
                    window.location.href = `/api/assets/${target.id}?download=1`;
                  }
                }
              : undefined
          }
          onNewFolder={() => {
            const target = menu.target;
            if (target.type === "folder") {
              setPath(target.path);
              setSelection({ type: "folder", path: target.path });
            }
            setError(null);
            setNewName("");
            setCreatingFolder(true);
          }}
          onDelete={() => {
            const target = menu.target;
            if (target.type === "file") {
              const asset = assets.find((item) => item.id === target.id);
              if (asset) setPendingDelete({ type: "file", asset });
              return;
            }
            setPendingDelete({ type: "folder", path: target.path });
          }}
        />
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[18vh]">
          <div className="w-full max-w-md rounded-xl border border-line bg-raised p-5">
            <h2 className="text-[16px] font-medium">
              {pendingDelete.type === "file" ? "Delete file?" : "Delete folder?"}
            </h2>
            <p className="mt-2 text-[13px] text-muted">
              {pendingDelete.type === "file"
                ? `${pendingDelete.asset.filename} will be removed from the vault.`
                : `${pendingDelete.path} and everything inside it will be removed.`}
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
                onClick={() => void removeSelection()}
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

function NameDialog({
  title,
  hint,
  value,
  placeholder,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  hint: string;
  value: string;
  placeholder: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[18vh]">
      <form
        className="w-full max-w-md rounded-xl border border-line bg-raised p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h2 className="text-[16px] font-medium">{title}</h2>
        <p className="mt-1 text-[13px] text-muted">{hint}</p>
        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-4 w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-[13px] text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="rounded-md bg-accent px-3 py-2 text-[13px] text-canvas disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-muted">
      <path
        d="M2.5 4.2h4.1l1.2 1.3H13.5v6.3H2.5V4.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-muted">
      <path
        d="M4.2 2.5h5.1L11.8 5v8.5H4.2V2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9.2 2.6V5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyPane({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-[13px] text-muted">
      {text}
    </div>
  );
}

function placeholderFor(kind?: AssetKind): string {
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
