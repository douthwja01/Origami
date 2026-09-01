import path from "node:path";

/** Env var for the vault folder default (overridable in Settings → System). */
export const VAULT_DIR_ENV_VAR = "ORIGAMI_VAULT_DIR_DEFAULT";
/** Previous name; still honored when `ORIGAMI_VAULT_DIR_DEFAULT` is unset. */
export const VAULT_DIR_ENV_VAR_LEGACY = "ORIGAMI_VAULT_DIR";
/** Host folder bind-mounted as the vault environment default under Docker Compose. */
export const VAULT_HOST_ENV_VAR = "ORIGAMI_VAULT_HOST";

export function fallbackVaultDir(): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "vault");
}

/** Process-visible vault folder when nothing is stored in settings. */
export function vaultDirFromEnv(): string {
  const named = process.env[VAULT_DIR_ENV_VAR]?.trim();
  if (named) return named;
  const legacy = process.env[VAULT_DIR_ENV_VAR_LEGACY]?.trim();
  if (legacy) return legacy;
  return fallbackVaultDir();
}

/** Which env var currently supplies the default (for UI copy). */
export function vaultDirEnvVarName(): string {
  if (process.env[VAULT_DIR_ENV_VAR]?.trim()) return VAULT_DIR_ENV_VAR;
  if (process.env[VAULT_DIR_ENV_VAR_LEGACY]?.trim()) return VAULT_DIR_ENV_VAR_LEGACY;
  return VAULT_DIR_ENV_VAR;
}

/** Host path Docker Compose bind-mounts; not used by the Node process itself. */
export function vaultHostDirFromEnv(): string | null {
  const host = process.env[VAULT_HOST_ENV_VAR]?.trim();
  return host || null;
}
