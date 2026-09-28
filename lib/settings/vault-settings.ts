import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { logIfDatabaseUnreachable } from "@/lib/db/connection-error";
import { getDb } from "@/lib/db";
import { appSettings, assets, projectFolders } from "@/lib/db/schema";
import {
  connectSmb,
  disconnectSmb,
  offlineSmbPath,
  smbFsPath,
  vaultUsesSmbMount,
} from "@/lib/vault/smb-connect";
import {
  decryptSmbSettings,
  encryptSmbSettings,
  type SmbSettings,
} from "@/lib/vault/smb-secret";
import { applyVaultDirOverride, vaultRoot } from "@/lib/vault/vault";
import {
  interpretVaultDir,
  segmentsBelow,
  uncShareRoot,
} from "@/lib/vault/vault-location";
import { formatSmbVaultDir } from "@/lib/vault/vault-location-form";
import {
  VAULT_HOST_ENV_VAR,
  vaultDirEnvVarName,
  vaultDirFromEnv,
  vaultHostDirFromEnv,
} from "@/lib/vault/vault-dir-env";

export type SystemVaultSettings = {
  /** Local folder, or the SMB share shown as a UNC path. */
  vaultKind: "local" | "smb";
  /** Effective vault folder as seen by this process, or the SMB display path. */
  vaultDir: string;
  /** Default from `ORIGAMI_VAULT_DIR_DEFAULT` (or legacy `ORIGAMI_VAULT_DIR`). */
  vaultDirEnvDefault: string;
  /** Env var name currently supplying that default. */
  vaultDirEnvVar: string;
  /** True when the stored value is unset and the env default applies. */
  vaultDirUsesEnvDefault: boolean;
  /** Docker host bind-mount for the env default, when set. */
  vaultHostDir: string | null;
  vaultHostEnvVar: string;
  smbServer: string;
  smbShare: string;
  smbFolder: string;
  smbUsername: string;
  /** True when an encrypted password is already stored. */
  smbPasswordSet: boolean;
  /** Set when saved SMB settings could not be opened. */
  smbError: string | null;
};

export type VaultFileAction = "delete" | "keep";

export type SmbSettingsInput = {
  server: string;
  share: string;
  folder?: string;
  username: string;
  password?: string;
};

async function ensureSettingsRow() {
  const db = getDb();
  let [row] = await db
    .select({ vaultDir: appSettings.vaultDir, vaultSmb: appSettings.vaultSmb })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (!row) {
    [row] = await db.insert(appSettings).values({ id: 1 }).returning({
      vaultDir: appSettings.vaultDir,
      vaultSmb: appSettings.vaultSmb,
    });
  }
  return row;
}

function normalizeVaultDir(dir: string): string {
  return path.normalize(dir.trim());
}

function sameVaultDir(a: string, b: string): boolean {
  const left = normalizeVaultDir(a);
  const right = normalizeVaultDir(b);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export function parseVaultDir(value: unknown): string | null | false {
  if (value === null) return null;
  const interpreted = interpretVaultDir(value);
  if (!interpreted.ok) return false;
  if (sameVaultDir(interpreted.dir, vaultDirFromEnv())) return null;
  return interpreted.dir;
}

async function statKind(dir: string): Promise<"dir" | "other" | "missing"> {
  try {
    const info = await stat(dir);
    return info.isDirectory() ? "dir" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

function directoryError(): Error {
  return Object.assign(new Error("Vault location must be a directory"), {
    status: 400,
  });
}

function unreachableShareError(share: string): Error {
  return Object.assign(
    new Error(
      `Cannot reach the network share ${share}. Check the path and that this computer can open the share.`,
    ),
    { status: 400 },
  );
}

async function mkdirSegments(root: string, segments: string[]): Promise<void> {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

async function ensureDirectory(dir: string): Promise<void> {
  let kind: "dir" | "other" | "missing";
  try {
    kind = await statKind(dir);
  } catch (error) {
    const share = process.platform === "win32" ? uncShareRoot(dir) : null;
    if (share) throw unreachableShareError(share);
    throw Object.assign(
      new Error(`Cannot use this vault location: ${(error as Error).message}`),
      { status: 400 },
    );
  }
  if (kind === "dir") return;
  if (kind === "other") throw directoryError();

  const share = process.platform === "win32" ? uncShareRoot(dir) : null;
  if (share) {
    let shareKind: "dir" | "other" | "missing";
    try {
      shareKind = await statKind(share);
    } catch {
      throw unreachableShareError(share);
    }
    if (shareKind !== "dir") throw unreachableShareError(share);
    const segments = segmentsBelow(share, dir);
    if (!segments) {
      throw Object.assign(
        new Error(`Cannot create vault location under ${share}`),
        { status: 400 },
      );
    }
    if (segments.length === 0) return;
    try {
      await mkdirSegments(share, segments);
    } catch (error) {
      if ((await statKind(dir).catch(() => "missing")) === "dir") return;
      throw Object.assign(
        new Error(`Cannot create vault location: ${(error as Error).message}`),
        { status: 400 },
      );
    }
    return;
  }

  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    throw Object.assign(
      new Error(`Cannot create vault location: ${(error as Error).message}`),
      { status: 400 },
    );
  }
}

function httpError(message: string, status = 400): Error {
  return Object.assign(new Error(message), { status });
}

function cleanToken(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\\/\0\r\n]/.test(trimmed) || trimmed === "." || trimmed === "..") {
    throw httpError(`${label} must be a name without slashes`);
  }
  return trimmed;
}

function cleanFolder(value: string): string {
  const parts = value
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.includes("\0"))) {
    throw httpError("Folder inside the share cannot contain . or ..");
  }
  return parts.join("/");
}

function readStoredSmb(payload: string | null): SmbSettings | null {
  if (!payload) return null;
  return decryptSmbSettings(payload);
}

function settingsResponse(
  smb: SmbSettings | null,
  options: {
    vaultKind: "local" | "smb";
    vaultDir: string;
    usesEnvDefault: boolean;
    smbError: string | null;
  },
): SystemVaultSettings {
  return {
    vaultKind: options.vaultKind,
    vaultDir: options.vaultDir,
    vaultDirEnvDefault: vaultDirFromEnv(),
    vaultDirEnvVar: vaultDirEnvVarName(),
    vaultDirUsesEnvDefault: options.usesEnvDefault,
    vaultHostDir: vaultHostDirFromEnv(),
    vaultHostEnvVar: VAULT_HOST_ENV_VAR,
    smbServer: smb?.server ?? "",
    smbShare: smb?.share ?? "",
    smbFolder: smb?.folder ?? "",
    smbUsername: smb?.username ?? "",
    smbPasswordSet: Boolean(smb?.password),
    smbError: options.smbError,
  };
}

async function activateSmb(smb: SmbSettings): Promise<SystemVaultSettings> {
  const shown = formatSmbVaultDir(smb.server, smb.share, smb.folder) ?? "";
  try {
    const connected = await connectSmb(smb);
    applyVaultDirOverride(connected.fsPath);
    return settingsResponse(smb, {
      vaultKind: "smb",
      vaultDir: connected.displayPath,
      usesEnvDefault: false,
      smbError: null,
    });
  } catch (error) {
    applyVaultDirOverride(offlineSmbPath());
    return settingsResponse(smb, {
      vaultKind: "smb",
      vaultDir: shown,
      usesEnvDefault: false,
      smbError: (error as Error).message,
    });
  }
}

export async function getSystemVaultSettings(): Promise<SystemVaultSettings> {
  const row = await ensureSettingsRow();
  if (row.vaultSmb) {
    try {
      const smb = readStoredSmb(row.vaultSmb);
      if (smb) return activateSmb(smb);
    } catch (error) {
      applyVaultDirOverride(offlineSmbPath());
      return settingsResponse(null, {
        vaultKind: "smb",
        vaultDir: "",
        usesEnvDefault: false,
        smbError: (error as Error).message,
      });
    }
  }
  applyVaultDirOverride(row.vaultDir);
  return settingsResponse(null, {
    vaultKind: "local",
    vaultDir: vaultRoot(),
    usesEnvDefault: row.vaultDir == null,
    smbError: null,
  });
}

export async function hydrateVaultDirFromSettings(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getSystemVaultSettings();
  } catch (error) {
    if (!logIfDatabaseUnreachable(error)) {
      console.error("[origami] could not load vault location from settings", error);
    }
    applyVaultDirOverride(null);
  }
}

function pathIsInside(parent: string, child: string): boolean {
  if (sameVaultDir(parent, child)) return false;
  const rel =
    process.platform === "win32"
      ? path.win32.relative(path.win32.resolve(parent), path.win32.resolve(child))
      : path.relative(path.resolve(parent), path.resolve(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function deleteVaultContents(root: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw httpError(`Cannot delete vault files: ${(error as Error).message}`);
  }
  for (const name of names) {
    await rm(path.join(root, name), { recursive: true, force: true });
  }
}

async function resolveNextVaultTarget(patch: {
  vaultDir?: string | null;
  smb?: SmbSettingsInput | null;
}): Promise<{
  nextFsPath: string;
  vaultDir: string | null;
  vaultSmb: string | null;
  prepare: () => Promise<void>;
}> {
  if (patch.smb) {
    const row = await ensureSettingsRow();
    let existing: SmbSettings | null = null;
    if (row.vaultSmb) {
      try {
        existing = readStoredSmb(row.vaultSmb);
      } catch {
        existing = null;
      }
    }
    const smb = parseSmbInput(patch.smb, existing);
    return {
      nextFsPath: smbFsPath(smb),
      vaultDir: null,
      vaultSmb: encryptSmbSettings(smb),
      prepare: async () => {
        await connectSmb(smb);
      },
    };
  }

  if (patch.vaultDir === undefined) {
    throw httpError("Vault location is required");
  }
  let stored: string | null;
  if (patch.vaultDir === null) {
    stored = null;
  } else {
    const interpreted = interpretVaultDir(patch.vaultDir);
    if (!interpreted.ok) throw httpError(interpreted.error);
    stored = sameVaultDir(interpreted.dir, vaultDirFromEnv())
      ? null
      : interpreted.dir;
  }
  const nextFsPath = stored ?? vaultDirFromEnv();
  return {
    nextFsPath,
    vaultDir: stored,
    vaultSmb: null,
    prepare: async () => {
      await disconnectSmb();
      await ensureDirectory(nextFsPath);
    },
  };
}

async function commitVaultMove(input: {
  nextFsPath: string;
  fileAction: VaultFileAction | undefined;
  vaultDir: string | null;
  vaultSmb: string | null;
  prepare: () => Promise<void>;
}): Promise<void> {
  const previous = vaultRoot();
  const locationChanged = !sameVaultDir(previous, input.nextFsPath);
  if (locationChanged) {
    if (input.fileAction !== "delete" && input.fileAction !== "keep") {
      throw httpError(
        "Choose whether to delete the current vault files before initializing the new location",
      );
    }
    if (
      input.fileAction === "delete" &&
      pathIsInside(previous, input.nextFsPath) &&
      !sameVaultDir(previous, offlineSmbPath())
    ) {
      throw httpError(
        "The new vault is inside the current one. Keep the existing files, or choose a location outside the current vault.",
      );
    }
  }

  const deleteFiles =
    locationChanged &&
    input.fileAction === "delete" &&
    !sameVaultDir(previous, offlineSmbPath());
  const remountsCurrent = vaultUsesSmbMount(previous);

  if (deleteFiles && remountsCurrent) {
    await deleteVaultContents(previous);
  }

  await input.prepare();

  if (deleteFiles && !remountsCurrent) {
    await deleteVaultContents(previous);
  }

  if (deleteFiles && !sameVaultDir(previous, input.nextFsPath)) {
    await deleteVaultContents(input.nextFsPath);
  }

  const db = getDb();
  await ensureSettingsRow();
  await db.transaction(async (tx) => {
    if (locationChanged) {
      await tx.delete(assets);
      await tx.delete(projectFolders);
    }
    await tx
      .update(appSettings)
      .set({
        vaultDir: input.vaultDir,
        vaultSmb: input.vaultSmb,
        ...(locationChanged
          ? { vaultLogoPath: null, vaultLogoMime: null, vaultLogoHash: null }
          : {}),
      })
      .where(eq(appSettings.id, 1));
  });
  applyVaultDirOverride(input.nextFsPath);
}

function parseSmbInput(input: SmbSettingsInput, existing: SmbSettings | null): SmbSettings {
  const server = cleanToken(input.server ?? "", "Server");
  const share = cleanToken(input.share ?? "", "Share");
  const folder = cleanFolder(input.folder ?? "");
  const username = (input.username ?? "").trim();
  if (!username || /[/\0\r\n]/.test(username)) {
    throw httpError("Enter the SMB username");
  }
  const typed = input.password ?? "";
  if (/[\r\n]/.test(typed)) {
    throw httpError("Password cannot contain line breaks");
  }
  const sameAccount =
    existing !== null &&
    existing.server === server &&
    existing.share === share &&
    existing.username === username;
  const password = typed || (sameAccount ? existing.password : "");
  if (!password && !sameAccount) {
    throw httpError("Enter the SMB password");
  }
  return { server, share, folder, username, password };
}

export async function updateSystemVaultSettings(patch: {
  vaultDir?: string | null;
  smb?: SmbSettingsInput | null;
  fileAction?: VaultFileAction;
}): Promise<SystemVaultSettings> {
  if (patch.smb === undefined && patch.vaultDir === undefined) {
    return getSystemVaultSettings();
  }
  try {
    const target = await resolveNextVaultTarget(patch);
    await commitVaultMove({
      nextFsPath: target.nextFsPath,
      fileAction: patch.fileAction,
      vaultDir: target.vaultDir,
      vaultSmb: target.vaultSmb,
      prepare: target.prepare,
    });
  } catch (error) {
    if ((error as { status?: number }).status) throw error;
    throw httpError((error as Error).message);
  }
  return getSystemVaultSettings();
}
