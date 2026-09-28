export type VaultLocationKind = "local" | "smb";

export type VaultLocationFields = {
  kind: VaultLocationKind;
  localPath: string;
  server: string;
  share: string;
  folder: string;
  username: string;
  password: string;
};

function cleanFolder(value: string | undefined): string {
  return (value ?? "").replace(/[\\/]+$/, "").replace(/\//g, "\\");
}

function parseSmb(dir: string): VaultLocationFields | null {
  const smb = /^smb:\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(dir);
  if (smb && !smb[1].includes("@")) {
    const host = smb[1].startsWith("[") ? smb[1].slice(1, smb[1].indexOf("]")) : smb[1];
    const [share, ...rest] = (smb[2] ?? "").split("/").filter(Boolean);
    if (host && share) {
      return {
        kind: "smb",
        localPath: "",
        server: host,
        share,
        folder: cleanFolder(rest.join("/")),
        username: "",
        password: "",
      };
    }
  }

  const unc = /^(?:\\\\|\/\/)([^\\/]+)[\\/]([^\\/]+)(?:[\\/]([\s\S]*))?$/.exec(dir);
  if (!unc) return null;
  return {
    kind: "smb",
    localPath: "",
    server: unc[1],
    share: unc[2],
    folder: cleanFolder(unc[3]),
    username: "",
    password: "",
  };
}

/** Split a saved vault path into the local / SMB fields shown in settings. */
export function vaultLocationFields(dir: string): VaultLocationFields {
  const trimmed = dir.trim();
  return (
    parseSmb(trimmed) ?? {
      kind: "local",
      localPath: trimmed,
      server: "",
      share: "",
      folder: "",
      username: "",
      password: "",
    }
  );
}

/** Build a Windows UNC path from the SMB fields. */
export function formatSmbVaultDir(
  server: string,
  share: string,
  folder: string,
): string | null {
  const host = server.trim();
  const shareName = share.trim();
  if (!host || !shareName) return null;
  if (/[\\/]/.test(host) || /[\\/]/.test(shareName)) return null;
  if (host === "." || host === ".." || shareName === "." || shareName === "..") return null;
  const rest = folder
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (rest.some((part) => part === "." || part === "..")) return null;
  return ["\\\\" + host, shareName, ...rest].join("\\");
}
