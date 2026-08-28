import { createHash } from "node:crypto";
import { mkdir, rename, unlink, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export function vaultRoot(): string {
  return process.env.ORIGAMI_VAULT_DIR || path.join(process.cwd(), "data", "vault");
}

function joinVault(...parts: string[]): string {
  const configured = process.env.ORIGAMI_VAULT_DIR;
  if (configured) {
    return path.join(/*turbopackIgnore: true*/ configured, ...parts);
  }
  return path.join(process.cwd(), "data", "vault", ...parts);
}

export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f\\/]/g, "_").trim();
  return base.length > 0 ? base.slice(0, 240) : "file";
}

function folderSegments(folderPath: string): string[] {
  return folderPath
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
}

function conflictError(message = "A file with that name already exists here") {
  return Object.assign(new Error(message), { status: 409 });
}

function isExistsError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "EEXIST";
}

function isNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

export function projectVaultDir(projectId: string): string {
  return joinVault(projectId);
}

export function projectFolderDir(projectId: string, folderPath = ""): string {
  const segments = folderSegments(folderPath);
  return segments.length > 0 ? joinVault(projectId, ...segments) : joinVault(projectId);
}

export function assetFilePath(
  projectId: string,
  folderPath: string,
  filename: string,
): string {
  return path.join(projectFolderDir(projectId, folderPath), safeFilename(filename));
}

export function relativeStoragePath(
  projectId: string,
  folderPath: string,
  filename: string,
): string {
  const segments = folderSegments(folderPath);
  return path.posix.join(projectId, ...segments, safeFilename(filename));
}

export function folderStoragePrefix(projectId: string, folderPath: string): string {
  const segments = folderSegments(folderPath);
  return segments.length > 0
    ? path.posix.join(projectId, ...segments)
    : projectId;
}

export function rewriteStoragePrefix(
  storagePath: string,
  fromPrefix: string,
  toPrefix: string,
): string {
  const normalized = storagePath.replace(/\\/g, "/");
  if (normalized === fromPrefix) return toPrefix;
  if (normalized.startsWith(`${fromPrefix}/`)) {
    return `${toPrefix}${normalized.slice(fromPrefix.length)}`;
  }
  return normalized;
}

export function absoluteFromStorage(storagePath: string): string {
  const normalized = storagePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p && p !== ".." && p !== ".");
  return joinVault(...parts);
}

export async function ensureProjectVault(projectId: string): Promise<void> {
  await mkdir(projectVaultDir(projectId), { recursive: true });
}

export async function ensureVaultFolder(
  projectId: string,
  folderPath: string,
): Promise<void> {
  await mkdir(projectFolderDir(projectId, folderPath), { recursive: true });
}

async function writeExclusive(
  dest: string,
  data: ReadableStream<Uint8Array> | Buffer,
  hash: ReturnType<typeof createHash>,
): Promise<number> {
  if (Buffer.isBuffer(data)) {
    hash.update(data);
    await writeFile(dest, data, { flag: "wx" });
    return data.length;
  }

  const nodeStream = Readable.fromWeb(
    data as import("node:stream/web").ReadableStream,
  );
  let bytes = 0;
  nodeStream.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    hash.update(chunk);
  });
  try {
    await pipeline(nodeStream, createWriteStream(dest, { flags: "wx" }));
  } catch (error) {
    if (!isExistsError(error)) {
      await unlink(dest).catch(() => undefined);
    }
    throw error;
  }
  return bytes;
}

export async function writeVaultFile(
  projectId: string,
  folderPath: string,
  filename: string,
  data: ReadableStream<Uint8Array> | Buffer,
): Promise<{ storagePath: string; bytes: number; sha256: string }> {
  await ensureVaultFolder(projectId, folderPath);
  const dest = assetFilePath(projectId, folderPath, filename);
  const hash = createHash("sha256");
  try {
    const bytes = await writeExclusive(dest, data, hash);
    return {
      storagePath: relativeStoragePath(projectId, folderPath, filename),
      bytes,
      sha256: hash.digest("hex"),
    };
  } catch (error) {
    if (isExistsError(error)) throw conflictError();
    throw error;
  }
}

export async function hashFileSha256(absPath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(absPath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function moveVaultFile(
  oldStoragePath: string,
  newStoragePath: string,
): Promise<string> {
  const from = absoluteFromStorage(oldStoragePath);
  const to = absoluteFromStorage(newStoragePath);
  const nextStoragePath = newStoragePath.replace(/\\/g, "/");
  if (path.resolve(from) === path.resolve(to)) return nextStoragePath;

  await mkdir(path.dirname(to), { recursive: true });

  // Windows cannot always rename in place for case-only changes.
  if (
    process.platform === "win32" &&
    from.toLowerCase() === to.toLowerCase()
  ) {
    const temp = path.join(
      path.dirname(to),
      `.renaming-${Date.now()}-${path.basename(to)}`,
    );
    await rename(from, temp);
    await rename(temp, to);
    return nextStoragePath;
  }

  try {
    await access(to);
    throw conflictError();
  } catch (error) {
    if ((error as { status?: number }).status === 409) throw error;
    if (!isNotFoundError(error)) throw error;
  }

  await rename(from, to);
  return nextStoragePath;
}

export async function renameVaultFile(
  oldStoragePath: string,
  newFilename: string,
): Promise<string> {
  const safe = safeFilename(newFilename);
  const normalized = oldStoragePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p && p !== ".." && p !== ".");
  parts[parts.length - 1] = safe;
  return moveVaultFile(oldStoragePath, parts.join("/"));
}

export async function removeVaultFile(storagePath: string): Promise<void> {
  const abs = absoluteFromStorage(storagePath);
  await unlink(abs).catch(() => undefined);
}

export async function renameVaultFolder(
  projectId: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const from = projectFolderDir(projectId, fromPath);
  const to = projectFolderDir(projectId, toPath);
  if (path.resolve(from) === path.resolve(to)) return;

  await mkdir(path.dirname(to), { recursive: true });

  try {
    await access(from);
  } catch {
    await mkdir(to, { recursive: true });
    return;
  }

  if (
    process.platform === "win32" &&
    from.toLowerCase() === to.toLowerCase()
  ) {
    const temp = `${to}.renaming-${Date.now()}`;
    await rename(from, temp);
    await rename(temp, to);
    return;
  }

  await rename(from, to);
}

export async function removeVaultFolder(
  projectId: string,
  folderPath: string,
): Promise<void> {
  if (!folderSegments(folderPath).length) return;
  await rm(projectFolderDir(projectId, folderPath), {
    recursive: true,
    force: true,
  });
}

export async function removeProjectVault(projectId: string): Promise<void> {
  await rm(joinVault(projectId), { recursive: true, force: true });
}

/** Vault-wide branding / config files (not project assets). */
export const VAULT_SETTINGS_DIR = "_settings";

export function vaultSettingsFilePath(filename: string): string {
  return joinVault(VAULT_SETTINGS_DIR, safeFilename(filename));
}

export function relativeVaultSettingsPath(filename: string): string {
  return path.posix.join(VAULT_SETTINGS_DIR, safeFilename(filename));
}

export async function writeVaultSettingsFile(
  filename: string,
  data: ReadableStream<Uint8Array> | Buffer,
): Promise<{ storagePath: string; bytes: number; sha256: string }> {
  const dir = joinVault(VAULT_SETTINGS_DIR);
  await mkdir(dir, { recursive: true });
  const dest = vaultSettingsFilePath(filename);
  const hash = createHash("sha256");
  if (Buffer.isBuffer(data)) {
    hash.update(data);
    await writeFile(dest, data);
    return {
      storagePath: relativeVaultSettingsPath(filename),
      bytes: data.length,
      sha256: hash.digest("hex"),
    };
  }
  const nodeStream = Readable.fromWeb(
    data as import("node:stream/web").ReadableStream,
  );
  let bytes = 0;
  nodeStream.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    hash.update(chunk);
  });
  await pipeline(nodeStream, createWriteStream(dest));
  return {
    storagePath: relativeVaultSettingsPath(filename),
    bytes,
    sha256: hash.digest("hex"),
  };
}
