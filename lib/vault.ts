import { createHash } from "node:crypto";
import { mkdir, unlink, rm, writeFile } from "node:fs/promises";
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

export function maxUploadBytes(): number {
  const mb = Number(process.env.ORIGAMI_MAX_UPLOAD_MB || "512");
  return (Number.isFinite(mb) && mb > 0 ? mb : 512) * 1024 * 1024;
}

export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f\\/]/g, "_").trim();
  return base.length > 0 ? base.slice(0, 240) : "file";
}

export function assetDir(projectId: string, assetId: string): string {
  return joinVault(projectId, assetId);
}

export function assetFilePath(
  projectId: string,
  assetId: string,
  filename: string,
): string {
  return joinVault(projectId, assetId, safeFilename(filename));
}

export function relativeStoragePath(
  projectId: string,
  assetId: string,
  filename: string,
): string {
  return path.posix.join(projectId, assetId, safeFilename(filename));
}

export function absoluteFromStorage(storagePath: string): string {
  const normalized = storagePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p && p !== ".." && p !== ".");
  return joinVault(...parts);
}

export async function writeVaultFile(
  projectId: string,
  assetId: string,
  filename: string,
  data: ReadableStream<Uint8Array> | Buffer,
): Promise<{ storagePath: string; bytes: number; sha256: string }> {
  const dir = assetDir(projectId, assetId);
  await mkdir(dir, { recursive: true });
  const dest = assetFilePath(projectId, assetId, filename);
  const hash = createHash("sha256");
  if (Buffer.isBuffer(data)) {
    hash.update(data);
    await writeFile(dest, data);
    return {
      storagePath: relativeStoragePath(projectId, assetId, filename),
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
    storagePath: relativeStoragePath(projectId, assetId, filename),
    bytes,
    sha256: hash.digest("hex"),
  };
}

export async function hashFileSha256(absPath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(absPath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function removeVaultFile(storagePath: string): Promise<void> {
  const abs = absoluteFromStorage(storagePath);
  await unlink(abs).catch(() => undefined);
  const dir = path.dirname(abs);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

export async function removeProjectVault(projectId: string): Promise<void> {
  await rm(joinVault(projectId), { recursive: true, force: true });
}
