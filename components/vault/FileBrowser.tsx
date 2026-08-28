"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetPreview } from "@/components/vault/AssetPreview";
import { TagChips, TagContextMenu } from "@/components/tags/TagMenu";
import { ToastStack, type Toast } from "@/components/ui/ToastStack";
import { formatBytes, kindLabel } from "@/lib/shared/format";
import {
  directChildFolderName,
  isUnderFolderPath,
  joinFolderPath,
} from "@/lib/vault/folder-path";
import { isHiddenFolderPath } from "@/lib/projects/project-background";
import { uploadsFromDataTransfer } from "@/lib/vault/drop-upload";
import { mimeFromFilename } from "@/lib/vault/kinds";
import {
  firstTagSortKey,
  itemMatchesTagQuery,
} from "@/lib/tags/tag-utils";
import {
  type AssetDTO,
  type AssetKind,
  type FolderDTO,
  type TagDTO,
} from "@/lib/shared/types";

const ASSET_DRAG = "application/x-origami-asset";

type SortMode = "name" | "date" | "tags";

type Selection =
  | { type: "folder"; path: string }
  | { type: "files"; ids: string[]; primaryId: string }
  | null;

type MenuState = {
  x: number;
  y: number;
  target:
    | { type: "file"; id: string }
    | { type: "folder"; path: string }
    | { type: "directory" };
};

type UploadBatchItem = { file: File; folderPath: string };

type UploadBatchResult = {
  succeeded: string[];
  skipped: { name: string; reason: string }[];
  failed: { name: string; error: string } | null;
  last: AssetDTO | null;
};

type Props = {
  projectId: string;
  assets: AssetDTO[];
  folders: FolderDTO[];
  tags: TagDTO[];
  rootLabel?: string;
  filterKind?: AssetKind;
  onChanged: () => Promise<void>;
};

export function FileBrowser({
  projectId,
  assets,
  folders,
  tags: catalog,
  rootLabel = "Vault",
  filterKind,
  onChanged,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renaming, setRenaming] = useState<
    | { type: "file"; asset: AssetDTO }
    | { type: "folder"; path: string }
    | null
  >(null);
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
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function pushToast(toast: Omit<Toast, "id">) {
    setToasts((prev) => [...prev, { ...toast, id: crypto.randomUUID() }]);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }

  function listPreview(names: string[], max = 6): string[] {
    if (names.length <= max) return names;
    return [...names.slice(0, max), `+${names.length - max} more`];
  }

  function notifyUploadResult(result: UploadBatchResult) {
    const { succeeded, skipped, failed } = result;
    if (succeeded.length > 0) {
      pushToast({
        kind: "success",
        title:
          succeeded.length === 1
            ? `Uploaded ${succeeded[0]}`
            : `Uploaded ${succeeded.length} files`,
        items: succeeded.length > 1 ? listPreview(succeeded) : undefined,
      });
    }
    if (skipped.length > 0) {
      pushToast({
        kind: "warning",
        title:
          skipped.length === 1 ? "Skipped 1 file" : `Skipped ${skipped.length} files`,
        items: listPreview(
          skipped.map((item) => `${item.name} — ${item.reason}`),
        ),
      });
    }
    if (failed) {
      pushToast({
        kind: "error",
        title: `Failed: ${failed.name}`,
        items: [failed.error],
      });
      setError(failed.error);
    }
  }

  useEffect(() => {
    void fetch("/api/settings/system")
      .then((res) => res.json())
      .then((data) => {
        const mb = data.settings?.maxUploadMb;
        if (typeof mb === "number" && mb > 0) {
          setMaxUploadBytes(mb * 1024 * 1024);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!creatingFile && !creatingFolder && !renaming && !pendingDelete) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreatingFile(false);
        setCreatingFolder(false);
        setRenaming(null);
        setPendingDelete(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creatingFile, creatingFolder, renaming, pendingDelete]);

  const visibleAssets = useMemo(
    () => assets.filter((asset) => !isHiddenFolderPath(asset.folderPath)),
    [assets],
  );
  const visibleFolders = useMemo(
    () => folders.filter((folder) => !isHiddenFolderPath(folder.path)),
    [folders],
  );

  const folderPaths = useMemo(() => {
    const set = new Set<string>();
    for (const folder of visibleFolders) set.add(folder.path);
    for (const asset of visibleAssets) {
      if (!asset.folderPath) continue;
      const parts = asset.folderPath.split("/");
      let built = "";
      for (const part of parts) {
        built = joinFolderPath(built, part);
        set.add(built);
      }
    }
    return set;
  }, [visibleAssets, visibleFolders]);

  const folderTagsOf = useMemo(() => {
    const map = new Map<string, TagDTO[]>();
    for (const folder of visibleFolders) map.set(folder.path, folder.tags);
    return map;
  }, [visibleFolders]);

  function tagsForFolder(folderPath: string): TagDTO[] {
    return folderTagsOf.get(folderPath) ?? [];
  }

  function folderHasKind(folderPath: string, kind: AssetKind): boolean {
    return visibleAssets.some(
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
  }, [visibleAssets, filterKind, folderPaths, path]);

  const childFiles = useMemo(() => {
    return visibleAssets
      .filter(
        (asset) =>
          asset.folderPath === path &&
          (!filterKind || asset.kind === filterKind),
      )
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }, [visibleAssets, filterKind, path]);

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
        visibleFolders.find((folder) => folder.path === folderPath)?.createdAt ?? "";
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
    visibleAssets,
    filterKind,
    filtering,
    folderPaths,
    folderTagsOf,
    visibleFolders,
    path,
    query,
    sort,
    tagFilter,
  ]);

  const listedFiles = useMemo(() => {
    const pool = visibleAssets.filter((asset) => {
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
  }, [visibleAssets, filterKind, filtering, path, query, sort, tagFilter]);

  const selectedFile = useMemo(() => {
    if (selection?.type !== "files") return null;
    return (
      visibleAssets.find((asset) => asset.id === selection.primaryId) ?? null
    );
  }, [visibleAssets, selection]);

  const selectedFileIds = useMemo(() => {
    if (selection?.type !== "files") return new Set<string>();
    return new Set(selection.ids);
  }, [selection]);

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
    if (target.type === "directory") return [] as TagDTO[];
    if (target.type === "file") {
      return visibleAssets.find((asset) => asset.id === target.id)?.tags ?? [];
    }
    return tagsForFolder(target.path);
  }, [visibleAssets, folderTagsOf, menu]);

  const deleteEnabled =
    selection?.type === "files" || selection?.type === "folder";
  const taggable =
    selection?.type === "folder" ||
    (selection?.type === "files" && selection.ids.length === 1);
  const headerLabel = filterKind ? kindLabel(filterKind) : rootLabel;

  function clearSelection() {
    setSelection(null);
    setSelectionAnchorId(null);
  }

  function selectSingleFile(assetId: string) {
    setSelection({ type: "files", ids: [assetId], primaryId: assetId });
    setSelectionAnchorId(assetId);
  }

  function selectFileClick(assetId: string, event: React.MouseEvent) {
    const orderedIds = listedFiles.map((asset) => asset.id);

    if (event.shiftKey) {
      const anchor =
        selectionAnchorId ??
        (selection?.type === "files" ? selection.primaryId : null) ??
        assetId;
      const from = orderedIds.indexOf(anchor);
      const to = orderedIds.indexOf(assetId);
      if (from >= 0 && to >= 0) {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        setSelection({
          type: "files",
          ids: orderedIds.slice(start, end + 1),
          primaryId: assetId,
        });
        return;
      }
    }

    if (event.metaKey || event.ctrlKey) {
      if (selection?.type === "files") {
        const next = new Set(selection.ids);
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
        if (next.size === 0) {
          clearSelection();
          return;
        }
        const ids = orderedIds.filter((id) => next.has(id));
        const primaryId = next.has(selection.primaryId)
          ? selection.primaryId
          : assetId;
        setSelection({ type: "files", ids, primaryId });
        setSelectionAnchorId(assetId);
        return;
      }
      selectSingleFile(assetId);
      return;
    }

    selectSingleFile(assetId);
  }

  function openFolder(nextPath: string) {
    setPath(nextPath);
    clearSelection();
  }

  function goUp() {
    if (!path) return;
    const parts = path.split("/");
    parts.pop();
    setPath(parts.join("/"));
    clearSelection();
  }

  function openItemMenu(
    event: React.MouseEvent,
    target: MenuState["target"],
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (target.type === "file") {
      if (selection?.type === "files" && selection.ids.includes(target.id)) {
        setSelection({ ...selection, primaryId: target.id });
      } else {
        selectSingleFile(target.id);
      }
    } else if (target.type === "folder") {
      setSelection({ type: "folder", path: target.path });
      setSelectionAnchorId(null);
    } else {
      clearSelection();
    }
    setMenu({ x: event.clientX, y: event.clientY, target });
  }

  async function saveTags(names: string[]) {
    if (!menu || menu.target.type === "directory") return;
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

  async function postFile(file: File, folderPath: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("folderPath", folderPath);
    const res = await fetch(`/api/projects/${projectId}/assets`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return { res, data, asset: data.asset as AssetDTO | undefined };
  }

  function perFileLimitMessage(file: File): string | null {
    if (maxUploadBytes == null || file.size <= maxUploadBytes) return null;
    return `${formatBytes(file.size)} (limit ${formatBytes(maxUploadBytes)})`;
  }

  async function runUploadBatch(
    items: UploadBatchItem[],
  ): Promise<UploadBatchResult> {
    const succeeded: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    let failed: { name: string; error: string } | null = null;
    let last: AssetDTO | null = null;

    for (let i = 0; i < items.length; i += 1) {
      const { file, folderPath } = items[i];
      const skipReason = perFileLimitMessage(file);
      if (skipReason) {
        skipped.push({ name: file.name, reason: skipReason });
        continue;
      }
      setUploading(
        items.length > 1
          ? `${i + 1}/${items.length} ${file.name}`
          : file.name,
      );
      const { res, data, asset } = await postFile(file, folderPath);
      if (!res.ok) {
        if (res.status === 413 || res.status === 409) {
          skipped.push({
            name: file.name,
            reason:
              data.error ||
              (res.status === 409
                ? "A file with that name already exists here"
                : `${formatBytes(file.size)} (limit ${
                    maxUploadBytes != null
                      ? formatBytes(maxUploadBytes)
                      : "unknown"
                  })`),
          });
          continue;
        }
        failed = {
          name: file.name,
          error: data.error || "Upload failed",
        };
        break;
      }
      succeeded.push(file.name);
      if (asset) last = asset;
    }
    setUploading(null);
    return { succeeded, skipped, failed, last };
  }

  async function uploadFiles(files: FileList | File[], folderPath: string) {
    setError(null);
    const result = await runUploadBatch(
      Array.from(files).map((file) => ({ file, folderPath })),
    );
    notifyUploadResult(result);
    if (result.last) selectSingleFile(result.last.id);
    await onChanged();
    return result.last;
  }

  async function ensureFolderPath(folderPath: string) {
    if (!folderPath) return true;
    const parts = folderPath.split("/").filter(Boolean);
    let parent = "";
    for (const name of parts) {
      const full = joinFolderPath(parent, name);
      const already =
        folderPaths.has(full) ||
        folders.some((folder) => folder.path === full);
      if (!already) {
        const res = await fetch(`/api/projects/${projectId}/folders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentPath: parent, name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status !== 409) {
            setError(data.error || `Could not create folder ${full}`);
            return false;
          }
        }
      }
      parent = full;
    }
    return true;
  }

  async function uploadDataTransfer(
    dataTransfer: DataTransfer,
    baseFolderPath: string,
  ) {
    setError(null);
    setDropTarget(null);
    const { uploads, folderPaths: neededFolders } =
      await uploadsFromDataTransfer(dataTransfer, baseFolderPath);
    if (uploads.length === 0 && neededFolders.length === 0) return;

    for (const folderPath of neededFolders) {
      setUploading(`Folder ${folderPath}`);
      const ok = await ensureFolderPath(folderPath);
      if (!ok) {
        setUploading(null);
        await onChanged();
        return;
      }
    }

    let last: AssetDTO | null = null;
    const result = await runUploadBatch(uploads);
    notifyUploadResult(result);
    last = result.last;
    if (last) selectSingleFile(last.id);
    else if (neededFolders.length > 0) {
      setSelection({
        type: "folder",
        path: neededFolders[neededFolders.length - 1],
      });
      setSelectionAnchorId(null);
    }
    await onChanged();
  }

  async function moveAssets(assetIds: string[], folderPath: string) {
    const toMove = assetIds.filter((assetId) => {
      const asset = visibleAssets.find((item) => item.id === assetId);
      return Boolean(asset && asset.folderPath !== folderPath);
    });
    if (toMove.length === 0) return;
    setError(null);
    for (const assetId of toMove) {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not move file");
        await onChanged();
        return;
      }
    }
    setSelection({
      type: "files",
      ids: toMove,
      primaryId: toMove[toMove.length - 1]!,
    });
    setSelectionAnchorId(toMove[toMove.length - 1]!);
    await onChanged();
  }

  function parseDraggedAssetIds(raw: string): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string")
      ) {
        return parsed.filter((id) =>
          visibleAssets.some((asset) => asset.id === id),
        );
      }
    } catch {
      // Fall through to plain / comma-separated ids.
    }
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(
        (id) => id.length > 0 && visibleAssets.some((asset) => asset.id === id),
      );
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
    setSelectionAnchorId(null);
    await onChanged();
  }

  async function renameFile() {
    if (!renaming || renaming.type !== "file") return;
    const filename = newName.trim();
    if (!filename || /[\\/]/.test(filename)) {
      setError("Enter a file name without path separators");
      return;
    }
    if (filename === renaming.asset.filename) {
      setRenaming(null);
      setNewName("");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/assets/${renaming.asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not rename file");
      return;
    }
    const assetId = renaming.asset.id;
    setRenaming(null);
    setNewName("");
    selectSingleFile(assetId);
    await onChanged();
  }

  function rewriteLocalPath(current: string, from: string, to: string) {
    if (current === from) return to;
    if (isUnderFolderPath(current, from)) return `${to}${current.slice(from.length)}`;
    return current;
  }

  async function renameFolderItem() {
    if (!renaming || renaming.type !== "folder") return;
    const name = newName.trim();
    if (!name) {
      setError("Enter a valid folder name");
      return;
    }
    const currentName = renaming.path.split("/").pop() ?? renaming.path;
    if (name === currentName) {
      setRenaming(null);
      setNewName("");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/folders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: renaming.path, name }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not rename folder");
      return;
    }
    const nextPath =
      typeof data.folder?.path === "string" ? data.folder.path : renaming.path;
    const from = renaming.path;
    setRenaming(null);
    setNewName("");
    setPath((current) => rewriteLocalPath(current, from, nextPath));
    setSelection((current) => {
      if (current?.type !== "folder") return current;
      return {
        type: "folder",
        path: rewriteLocalPath(current.path, from, nextPath),
      };
    });
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
      if (
        selection?.type === "files" &&
        selection.ids.includes(pendingDelete.asset.id)
      ) {
        const nextIds = selection.ids.filter(
          (id) => id !== pendingDelete.asset.id,
        );
        if (nextIds.length === 0) clearSelection();
        else {
          setSelection({
            type: "files",
            ids: nextIds,
            primaryId: nextIds.includes(selection.primaryId)
              ? selection.primaryId
              : nextIds[0]!,
          });
        }
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
        clearSelection();
      }
    }
    setPendingDelete(null);
    await onChanged();
  }

  function handleFolderDrop(folderPath: string, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const assetIds = parseDraggedAssetIds(
      event.dataTransfer.getData(ASSET_DRAG) ||
        event.dataTransfer.getData("text/plain"),
    );
    if (assetIds.length > 0) {
      void moveAssets(assetIds, folderPath);
      return;
    }
    if (
      event.dataTransfer.files.length > 0 ||
      [...event.dataTransfer.types].includes("Files")
    ) {
      void uploadDataTransfer(event.dataTransfer, folderPath);
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
    { label: headerLabel, onClick: () => { setPath(""); clearSelection(); } },
    ...((path ? path.split("/") : []).map((part, index, parts) => {
      const next = parts.slice(0, index + 1).join("/");
      return { label: part, onClick: () => openFolder(next) };
    })),
  ];

  const emptyTree =
    !filtering && childFolders.length === 0 && childFiles.length === 0;
  const emptySearch =
    filtering && listedFolders.length === 0 && listedFiles.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-raised">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
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
            if (selection?.type === "files" && selection.ids.length === 1) {
              openItemMenu(event, { type: "file", id: selection.primaryId });
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
            if (selection?.type === "files") {
              const asset = visibleAssets.find(
                (item) => item.id === selection.primaryId,
              );
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
          <div
            className="min-h-0 flex-1 overflow-auto"
            onContextMenu={(event) =>
              openItemMenu(event, { type: "directory" })
            }
          >
            <ul className="min-h-full select-none">
              <li>
                <button
                  type="button"
                  onClick={goUp}
                  disabled={!path}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted hover:bg-overlay/60 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
                >
                  <UpIcon />
                  <span className="truncate text-[13px]">Up</span>
                </button>
              </li>
              {emptyTree ? (
                <li>
                  <EmptyPane text="Empty folder. Use New folder / New file / Upload, or drop files and folders here." />
                </li>
              ) : emptySearch ? (
                <li>
                  <EmptyPane text="No files or folders match this search." />
                </li>
              ) : (
                <>
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
                        onClick={() => {
                          setSelection({ type: "folder", path: folder.path });
                          setSelectionAnchorId(null);
                        }}
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
                const selected = selectedFileIds.has(asset.id);
                const dragging = draggingIds.includes(asset.id);
                return (
                  <li key={asset.id}>
                    <div
                      draggable
                      onContextMenu={(event) =>
                        openItemMenu(event, { type: "file", id: asset.id })
                      }
                      onMouseDown={(event) => {
                        // Avoid shift-click text selection while ranging.
                        if (event.shiftKey) event.preventDefault();
                      }}
                      onDragStart={(event) => {
                        const ids =
                          selectedFileIds.has(asset.id) &&
                          selection?.type === "files"
                            ? selection.ids
                            : [asset.id];
                        if (!selectedFileIds.has(asset.id)) {
                          selectSingleFile(asset.id);
                        }
                        event.dataTransfer.setData(
                          ASSET_DRAG,
                          JSON.stringify(ids),
                        );
                        event.dataTransfer.setData("text/plain", ids.join(","));
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingIds(ids);
                      }}
                      onDragEnd={() => {
                        setDraggingIds([]);
                        setDropTarget(null);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 ${
                        selected ? "bg-overlay" : "hover:bg-overlay/60"
                      } ${dragging ? "opacity-50" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={(event) => selectFileClick(asset.id, event)}
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
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="flex min-h-[280px] min-w-0 flex-col overflow-hidden lg:min-h-0">
          {selectedFile ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {selection?.type === "files" && selection.ids.length > 1 ? (
                <p className="shrink-0 border-b border-line px-4 py-2 text-[12px] text-muted">
                  {selection.ids.length} files selected — drag to a folder to
                  move all
                </p>
              ) : null}
              {selectedFile.tags.length > 0 ? (
                <div className="shrink-0 border-b border-line px-4 py-2">
                  <TagChips
                    tags={selectedFile.tags}
                    onTagClick={applyTagFilter}
                  />
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-hidden">
                <AssetPreview asset={selectedFile} />
              </div>
            </div>
          ) : selection?.type === "folder" ? (
            <div className="overflow-auto p-4">
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
              : "Creates an empty file. Media, Code, Documents, CAD, or Backup is assigned from the file extension."
          }
          value={newName}
          placeholder={placeholderFor(filterKind)}
          busy={busy}
          submitLabel="Create"
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
          submitLabel="Create"
          onChange={setNewName}
          onCancel={() => setCreatingFolder(false)}
          onSubmit={() => void createFolder()}
        />
      ) : null}

      {renaming ? (
        <NameDialog
          title={renaming.type === "file" ? "Rename file" : "Rename folder"}
          hint={
            renaming.type === "file"
              ? "Updates the file name in the vault. Changing the extension may change its type."
              : "Renames this folder and updates paths for everything inside it."
          }
          value={newName}
          placeholder={
            renaming.type === "file"
              ? renaming.asset.filename
              : (renaming.path.split("/").pop() ?? renaming.path)
          }
          busy={busy}
          submitLabel="Rename"
          onChange={setNewName}
          onCancel={() => {
            setRenaming(null);
            setNewName("");
          }}
          onSubmit={() =>
            void (renaming.type === "file" ? renameFile() : renameFolderItem())
          }
        />
      ) : null}

      {menu ? (
        <TagContextMenu
          x={menu.x}
          y={menu.y}
          assigned={menu.target.type === "directory" ? undefined : menuAssigned}
          catalog={menu.target.type === "directory" ? undefined : catalog}
          onSetNames={
            menu.target.type === "directory" ? undefined : saveTags
          }
          onClose={() => setMenu(null)}
          onNewFile={
            menu.target.type === "directory"
              ? () => {
                  setError(null);
                  setNewName("");
                  setCreatingFile(true);
                }
              : undefined
          }
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
          onRename={
            menu.target.type === "directory"
              ? undefined
              : () => {
                  const target = menu.target;
                  setError(null);
                  if (target.type === "file") {
                    const asset = visibleAssets.find(
                      (item) => item.id === target.id,
                    );
                    if (!asset) return;
                    setNewName(asset.filename);
                    setRenaming({ type: "file", asset });
                    return;
                  }
                  if (target.type !== "folder") return;
                  const name = target.path.split("/").pop() ?? target.path;
                  setNewName(name);
                  setRenaming({ type: "folder", path: target.path });
                }
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
          onDelete={
            menu.target.type === "directory"
              ? undefined
              : () => {
                  const target = menu.target;
                  if (target.type === "file") {
                    const asset = visibleAssets.find(
                      (item) => item.id === target.id,
                    );
                    if (asset) setPendingDelete({ type: "file", asset });
                    return;
                  }
                  if (target.type === "folder") {
                    setPendingDelete({ type: "folder", path: target.path });
                  }
                }
          }
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
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function NameDialog({
  title,
  hint,
  value,
  placeholder,
  busy,
  submitLabel = "Create",
  onChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  hint: string;
  value: string;
  placeholder: string;
  busy: boolean;
  submitLabel?: string;
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
          onFocus={(event) => event.target.select()}
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
            {submitLabel}
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

function UpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M8 12.5V3.5M8 3.5 4.5 7M8 3.5 11.5 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
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
    case "backup":
      return "archive.zip";
    default:
      return "notes.md";
  }
}
