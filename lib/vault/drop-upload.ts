import { joinFolderPath, normalizeFolderPath } from "@/lib/vault/folder-path";

export type DroppedUpload = {
  file: File;
  /** Destination folder path inside the vault (no filename). */
  folderPath: string;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (
    success: (file: File) => void,
    error?: (err: DOMException) => void,
  ) => void;
};

type FileSystemDirectoryReaderLike = {
  readEntries: (
    success: (entries: FileSystemEntryLike[]) => void,
    error?: (err: DOMException) => void,
  ) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => FileSystemDirectoryReaderLike;
};

const SKIP_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini", "__macosx"]);

function shouldSkipName(name: string): boolean {
  return SKIP_NAMES.has(name.toLowerCase());
}

function readFileEntry(entry: FileSystemFileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readAllDirectoryEntries(
  reader: FileSystemDirectoryReaderLike,
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function walkEntry(
  entry: FileSystemEntryLike,
  parentRel: string,
  files: { file: File; relativeDir: string }[],
  folders: Set<string>,
): Promise<void> {
  if (shouldSkipName(entry.name)) return;

  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntryLike);
    files.push({ file, relativeDir: parentRel });
    return;
  }

  if (!entry.isDirectory) return;

  const dirRel = parentRel ? `${parentRel}/${entry.name}` : entry.name;
  folders.add(dirRel);
  const reader = (entry as FileSystemDirectoryEntryLike).createReader();
  const children = await readAllDirectoryEntries(reader);
  for (const child of children) {
    await walkEntry(child, dirRel, files, folders);
  }
}

function destinationFolder(
  baseFolderPath: string,
  relativeDir: string,
): string | null {
  const combined = relativeDir
    ? joinFolderPath(baseFolderPath, relativeDir)
    : baseFolderPath;
  return normalizeFolderPath(combined);
}

/**
 * Collect files (and folder paths) from a desktop drag-and-drop,
 * preserving relative folder structure under `baseFolderPath`.
 */
export async function uploadsFromDataTransfer(
  dataTransfer: DataTransfer,
  baseFolderPath: string,
): Promise<{ uploads: DroppedUpload[]; folderPaths: string[] }> {
  const base = normalizeFolderPath(baseFolderPath);
  if (base === null) {
    return { uploads: [], folderPaths: [] };
  }

  const relativeFiles: { file: File; relativeDir: string }[] = [];
  const relativeFolders = new Set<string>();
  const items = dataTransfer.items;

  if (items?.length) {
    const entries: FileSystemEntryLike[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind !== "file") continue;
      const entry =
        typeof item.webkitGetAsEntry === "function"
          ? (item.webkitGetAsEntry() as FileSystemEntryLike | null)
          : null;
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        await walkEntry(entry, "", relativeFiles, relativeFolders);
      }
    }
  }

  if (relativeFiles.length === 0 && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      if (shouldSkipName(file.name)) continue;
      const rel = (file as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      if (rel && rel.includes("/")) {
        const parts = rel.split("/");
        parts.pop();
        const relativeDir = parts.join("/");
        if (relativeDir) relativeFolders.add(relativeDir);
        relativeFiles.push({ file, relativeDir });
      } else {
        relativeFiles.push({ file, relativeDir: "" });
      }
    }
  }

  const folderPaths = new Set<string>();
  for (const rel of relativeFolders) {
    const parts = rel.split("/").filter(Boolean);
    let built = "";
    for (const part of parts) {
      built = built ? `${built}/${part}` : part;
      const full = destinationFolder(base, built);
      if (full) folderPaths.add(full);
    }
  }

  const uploads: DroppedUpload[] = [];
  for (const item of relativeFiles) {
    const folderPath = destinationFolder(base, item.relativeDir);
    if (folderPath === null) continue;
    if (folderPath) folderPaths.add(folderPath);
    // Also ensure every parent of the file folder exists.
    if (folderPath) {
      const parts = folderPath.split("/");
      let built = "";
      for (const part of parts) {
        built = built ? `${built}/${part}` : part;
        folderPaths.add(built);
      }
    }
    uploads.push({ file: item.file, folderPath });
  }

  const sortedFolders = [...folderPaths].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );

  return { uploads, folderPaths: sortedFolders };
}
