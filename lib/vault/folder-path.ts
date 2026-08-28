export const FOLDER_PATH_MAX = 500;
export const FOLDER_NAME_MAX = 120;

/** Normalize a folder path to slash-separated segments with no leading/trailing slash. */
export function normalizeFolderPath(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const parts = value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part === "." || part === "..") return null;
    if (part.length > FOLDER_NAME_MAX) return null;
    if (/[<>:"|?*\u0000-\u001f]/.test(part)) return null;
  }
  const path = parts.join("/");
  if (path.length > FOLDER_PATH_MAX) return null;
  return path;
}

export function parseFolderName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > FOLDER_NAME_MAX) return null;
  if (name === "." || name === ".." || /[\\/]/.test(name)) return null;
  if (/[<>:"|?*\u0000-\u001f]/.test(name)) return null;
  return name;
}

export function joinFolderPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function folderParentAndName(fullPath: string): {
  parent: string;
  name: string;
} {
  const slash = fullPath.lastIndexOf("/");
  if (slash === -1) return { parent: "", name: fullPath };
  return {
    parent: fullPath.slice(0, slash),
    name: fullPath.slice(slash + 1),
  };
}

/** Next available filename in a set of names already used in a folder. */
export function uniquifyFilename(filename: string, used: Set<string>): string {
  if (!used.has(filename)) return filename;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let n = 2;
  let candidate = `${stem}-${n}${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  return candidate;
}

export function isUnderFolderPath(path: string, parent: string): boolean {
  if (!parent) return path.length > 0;
  return path === parent || path.startsWith(`${parent}/`);
}

/** Immediate child folder name under parent, or null if not a direct child. */
export function directChildFolderName(
  fullPath: string,
  parentPath: string,
): string | null {
  if (!isUnderFolderPath(fullPath, parentPath)) return null;
  const rest = parentPath
    ? fullPath.slice(parentPath.length + 1)
    : fullPath;
  if (!rest) return null;
  const child = rest.split("/")[0];
  return child || null;
}

export function folderBreadcrumbs(path: string, rootLabel = "Vault") {
  const parts = path ? path.split("/") : [];
  const crumbs: { label: string; path: string }[] = [
    { label: rootLabel, path: "" },
  ];
  let built = "";
  for (const part of parts) {
    built = joinFolderPath(built, part);
    crumbs.push({ label: part, path: built });
  }
  return crumbs;
}
