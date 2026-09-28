import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const PREFIX = "origami-smb-v1:";
const SALT = "origami-vault-smb-v1";

export type SmbSettings = {
  server: string;
  share: string;
  folder: string;
  username: string;
  password: string;
};

const globalForKey = globalThis as unknown as { origamiSmbKey?: Buffer };

function encryptionKey(): Buffer {
  if (!globalForKey.origamiSmbKey) {
    const secret = process.env.ORIGAMI_SESSION_SECRET ?? "";
    if (secret.length < 32) {
      throw new Error(
        "ORIGAMI_SESSION_SECRET must be set to at least 32 characters to store SMB settings",
      );
    }
    globalForKey.origamiSmbKey = scryptSync(secret, SALT, 32);
  }
  return globalForKey.origamiSmbKey;
}

export function encryptSmbSettings(settings: SmbSettings): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(settings), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSmbSettings(payload: string): SmbSettings {
  if (!payload.startsWith(PREFIX)) {
    throw new Error("Saved SMB settings could not be decrypted");
  }
  const raw = Buffer.from(payload.slice(PREFIX.length), "base64");
  if (raw.length < 12 + 16) {
    throw new Error("Saved SMB settings could not be decrypted");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  let json: string;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(
      "Saved SMB settings could not be decrypted. Check ORIGAMI_SESSION_SECRET.",
    );
  }
  const parsed = JSON.parse(json) as Partial<SmbSettings>;
  if (!parsed.server || !parsed.share || typeof parsed.username !== "string") {
    throw new Error("Saved SMB settings could not be decrypted");
  }
  return {
    server: parsed.server,
    share: parsed.share,
    folder: parsed.folder ?? "",
    username: parsed.username,
    password: parsed.password ?? "",
  };
}
