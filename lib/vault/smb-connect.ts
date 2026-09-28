import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SmbSettings } from "@/lib/vault/smb-secret";
import { formatSmbVaultDir } from "@/lib/vault/vault-location-form";

const MOUNT_POINT = path.join(tmpdir(), "origami-vault-smb");

type ActiveShare = {
  key: string;
  fsPath: string;
};

const globalForSmb = globalThis as unknown as {
  origamiSmbActive?: ActiveShare | null;
  origamiSmbChain?: Promise<unknown>;
};

function settingsKey(settings: SmbSettings): string {
  return JSON.stringify([
    settings.server,
    settings.share,
    settings.folder,
    settings.username,
    settings.password,
  ]);
}

function displayPath(settings: SmbSettings): string {
  return (
    formatSmbVaultDir(settings.server, settings.share, settings.folder) ??
    `\\\\${settings.server}\\${settings.share}`
  );
}

function redact(text: string, password: string): string {
  const trimmed = text.trim();
  if (!password) return trimmed;
  return trimmed.split(password).join("••••");
}

function run(command: string, args: string[], password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            "This server cannot mount SMB shares. Install cifs-utils and allow the container to mount filesystems.",
          ),
        );
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = redact(output, password);
      reject(
        new Error(
          detail || `Could not connect to the SMB share (exit ${code ?? "unknown"})`,
        ),
      );
    });
  });
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

/** Filesystem path the share will use after it is connected. */
export function smbFsPath(settings: SmbSettings): string {
  const segments = folderSegments(settings.folder);
  if (process.platform === "win32") {
    return path.win32.join(shareUnc(settings), ...segments);
  }
  return path.join(MOUNT_POINT, ...segments);
}

function shareUnc(settings: SmbSettings): string {
  return `\\\\${settings.server}\\${settings.share}`;
}

function folderSegments(folder: string): string[] {
  return folder
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function connectWindows(settings: SmbSettings): Promise<string> {
  const root = shareUnc(settings);
  const net = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "net.exe")
    : "net";
  await run(net, ["use", root, "/delete", "/y"], settings.password).catch(() => undefined);
  const args = ["use", root];
  if (settings.password) args.push(settings.password);
  if (settings.username) args.push(`/user:${settings.username}`);
  await run(net, args, settings.password);
  const fsPath = path.win32.join(root, ...folderSegments(settings.folder));
  await mkdir(fsPath, { recursive: true }).catch(async (error) => {
    if (await isDirectory(fsPath)) return;
    throw error;
  });
  return fsPath;
}

function credentialLines(settings: SmbSettings): string {
  const slash = settings.username.indexOf("\\");
  const domain = slash === -1 ? "" : settings.username.slice(0, slash);
  const username = slash === -1 ? settings.username : settings.username.slice(slash + 1);
  const lines = [`username=${username}`, `password=${settings.password}`];
  if (domain) lines.push(`domain=${domain}`);
  return `${lines.join("\n")}\n`;
}

async function connectLinux(settings: SmbSettings): Promise<string> {
  await mkdir(MOUNT_POINT, { recursive: true });
  await run("umount", [MOUNT_POINT], settings.password).catch(() => undefined);
  const credPath = path.join(
    tmpdir(),
    `origami-smb-${randomBytes(8).toString("hex")}.cred`,
  );
  await writeFile(credPath, credentialLines(settings), { mode: 0o600 });
  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  try {
    await run(
      "mount",
      [
        "-t",
        "cifs",
        `//${settings.server}/${settings.share}`,
        MOUNT_POINT,
        "-o",
        `credentials=${credPath},uid=${uid},gid=${gid},file_mode=0664,dir_mode=0775`,
      ],
      settings.password,
    );
  } finally {
    await rm(credPath, { force: true });
  }
  const fsPath = path.join(MOUNT_POINT, ...folderSegments(settings.folder));
  await mkdir(fsPath, { recursive: true }).catch(async (error) => {
    if (await isDirectory(fsPath)) return;
    throw error;
  });
  return fsPath;
}

async function connectExclusive(settings: SmbSettings): Promise<string> {
  const key = settingsKey(settings);
  const active = globalForSmb.origamiSmbActive;
  if (active?.key === key && (await isDirectory(active.fsPath))) {
    return active.fsPath;
  }
  let fsPath: string;
  try {
    fsPath =
      process.platform === "win32"
        ? await connectWindows(settings)
        : await connectLinux(settings);
  } catch (error) {
    throw new Error(`Cannot connect to ${displayPath(settings)}. ${(error as Error).message}`);
  }
  if (!(await isDirectory(fsPath))) {
    throw new Error(`Could not open ${displayPath(settings)}`);
  }
  globalForSmb.origamiSmbActive = { key, fsPath };
  return fsPath;
}

/** Mount or map the share and return the folder this process should use. */
export async function connectSmb(
  settings: SmbSettings,
): Promise<{ fsPath: string; displayPath: string }> {
  const prior = globalForSmb.origamiSmbChain ?? Promise.resolve();
  const next = prior.then(() => connectExclusive(settings), () => connectExclusive(settings));
  globalForSmb.origamiSmbChain = next.then(
    () => undefined,
    () => undefined,
  );
  const fsPath = await next;
  return { fsPath, displayPath: displayPath(settings) };
}

export async function disconnectSmb(): Promise<void> {
  globalForSmb.origamiSmbActive = null;
  if (process.platform === "win32") return;
  await run("umount", [MOUNT_POINT], "").catch(() => undefined);
}

/** True when this folder is the Linux SMB mount or a directory inside it. */
export function vaultUsesSmbMount(dir: string): boolean {
  if (process.platform === "win32") return false;
  const rel = path.relative(MOUNT_POINT, dir);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function offlineSmbPath(): string {
  return path.join(tmpdir(), "origami-vault-smb-offline");
}
