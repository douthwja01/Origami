import path from "node:path";

const VAULT_DIR_MAX = 4096;

const GENERIC_VAULT_DIR_ERROR =
  "Vault location must be a folder path this server can write to";

const SHARE_REQUIRED_ERROR =
  "A network vault needs a server and a share, for example \\\\server\\share\\folder or smb://server/share/folder.";

const CREDENTIALS_ERROR =
  "Remove the username and password from the vault location. Connect to the share in Windows, then enter \\\\server\\share\\folder.";

const LINUX_NETWORK_ERROR =
  "Enter this as an SMB share with a username and password. A deployed server cannot open a network path as a local folder.";

export type InterpretedVaultDir =
  | { ok: true; dir: string }
  | { ok: false; error: string };

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const start = value[0];
    const end = value[value.length - 1];
    if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

function badSegment(segment: string): boolean {
  return (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("\\") ||
    segment.includes("\0")
  );
}

function toUnc(host: string, segments: string[]): string {
  return path.win32.normalize(`\\\\${host}\\${segments.join("\\")}`);
}

function interpretSmbUrl(
  dir: string,
  platform: NodeJS.Platform,
): InterpretedVaultDir | null {
  if (!/^smb:/i.test(dir)) return null;
  const match = /^smb:\/\/([^/?#]*)(\/[^?#]*)?$/i.exec(dir);
  if (!match) return { ok: false, error: SHARE_REQUIRED_ERROR };

  const authority = match[1];
  if (!authority || authority.includes("@")) {
    return {
      ok: false,
      error: authority?.includes("@") ? CREDENTIALS_ERROR : SHARE_REQUIRED_ERROR,
    };
  }

  const host = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : authority;
  let segments: string[];
  try {
    segments = (match[2] ?? "")
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return { ok: false, error: SHARE_REQUIRED_ERROR };
  }

  if (!host || host === "." || host === ".." || segments.length < 1 || segments.some(badSegment)) {
    return { ok: false, error: SHARE_REQUIRED_ERROR };
  }
  if (platform !== "win32") return { ok: false, error: LINUX_NETWORK_ERROR };
  return { ok: true, dir: toUnc(host, segments) };
}

function interpretUnc(
  dir: string,
  platform: NodeJS.Platform,
): InterpretedVaultDir | null {
  const windowsUnc = dir.startsWith("\\\\");
  const slashUnc =
    platform === "win32" && dir.startsWith("//") && !dir.startsWith("///");
  if (!windowsUnc && !slashUnc) return null;
  if (/^\\\\\?\\/i.test(dir) || /^\/\/\?\//.test(dir)) return null;

  if (platform !== "win32") return { ok: false, error: LINUX_NETWORK_ERROR };

  const parts = dir
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  const [host, ...segments] = parts;
  if (!host || host === "." || host === ".." || segments.length < 1 || segments.some(badSegment)) {
    return { ok: false, error: SHARE_REQUIRED_ERROR };
  }
  return { ok: true, dir: toUnc(host, segments) };
}

/** Turn a settings value into the folder path this process should use. */
export function interpretVaultDir(
  value: unknown,
  platform: NodeJS.Platform = process.platform,
): InterpretedVaultDir {
  if (typeof value !== "string") return { ok: false, error: GENERIC_VAULT_DIR_ERROR };
  const dir = stripWrappingQuotes(value.trim());
  if (!dir || dir.includes("\0") || dir.length > VAULT_DIR_MAX) {
    return { ok: false, error: GENERIC_VAULT_DIR_ERROR };
  }

  const smb = interpretSmbUrl(dir, platform);
  if (smb) return smb;
  const unc = interpretUnc(dir, platform);
  if (unc) return unc;

  return { ok: true, dir: path.normalize(dir) };
}

/** `\\server\share` prefix of a Windows UNC path, without a trailing slash. */
export function uncShareRoot(dir: string): string | null {
  const normalized = path.win32.normalize(dir);
  const match = /^\\\\[^\\]+\\[^\\]+/.exec(normalized);
  return match ? match[0] : null;
}

/** Path segments under an existing share root. Empty when `dir` is the share itself. */
export function segmentsBelow(shareRoot: string, dir: string): string[] | null {
  const rel = path.win32.relative(shareRoot, path.win32.normalize(dir));
  if (rel === "") return [];
  if (!rel || rel.startsWith("..") || path.win32.isAbsolute(rel)) return null;
  return rel.split("\\").filter(Boolean);
}
