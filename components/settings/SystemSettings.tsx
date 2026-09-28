"use client";

import { useState } from "react";
import type { SystemUploadSettings } from "@/lib/settings/upload-settings";
import type { SystemVaultSettings } from "@/lib/settings/vault-settings";
import {
  type VaultLocationFields,
  type VaultLocationKind,
} from "@/lib/vault/vault-location-form";

type SystemPageSettings = SystemUploadSettings & SystemVaultSettings;

type Props = {
  initialSettings: SystemPageSettings;
};

function formatLimit(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) {
    return `${mb / 1024} GB (${mb.toLocaleString()} MB)`;
  }
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB (${mb.toLocaleString()} MB)`;
  }
  return `${mb.toLocaleString()} MB`;
}

const fieldClass =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent disabled:opacity-50";

function FieldHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
      {label}
      <span className="group relative normal-case tracking-normal">
        <button
          type="button"
          aria-label={hint}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line text-[9px] leading-none text-muted"
        >
          ?
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 rounded-md border border-line bg-canvas px-2 py-1.5 text-left text-[12px] font-normal text-ink shadow-sm group-hover:block group-focus-within:block"
        >
          {hint}
        </span>
      </span>
    </span>
  );
}

function fieldsFromSettings(settings: SystemPageSettings): VaultLocationFields {
  if (settings.vaultKind === "smb") {
    return {
      kind: "smb",
      localPath: "",
      server: settings.smbServer,
      share: settings.smbShare,
      folder: settings.smbFolder,
      username: settings.smbUsername,
      password: "",
    };
  }
  return {
    kind: "local",
    localPath: settings.vaultDir,
    server: "",
    share: "",
    folder: "",
    username: "",
    password: "",
  };
}

export function SystemSettings({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [input, setInput] = useState(String(initialSettings.maxUploadMb));
  const [vaultForm, setVaultForm] = useState(() =>
    fieldsFromSettings(initialSettings),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyVaultForm(next: SystemPageSettings) {
    setVaultForm(fieldsFromSettings(next));
  }

  function selectVaultKind(kind: VaultLocationKind) {
    setVaultForm((current) => ({ ...current, kind }));
  }

  function patchVault(patch: Partial<VaultLocationFields>) {
    setVaultForm((current) => ({ ...current, ...patch }));
  }

  function sameVaultPath(left: string, right: string): boolean {
    return (
      left.replace(/[\\/]+$/, "").toLowerCase() ===
      right.replace(/[\\/]+$/, "").toLowerCase()
    );
  }

  function pendingVaultDir():
    | { dir: string }
    | {
        smb: {
          server: string;
          share: string;
          folder: string;
          username: string;
          password: string;
        };
      }
    | { error: string }
    | { unchanged: true } {
    if (vaultForm.kind === "local") {
      const trimmed = vaultForm.localPath.trim();
      if (!trimmed) return { error: "Enter a folder path" };
      if (settings.vaultKind === "local" && sameVaultPath(trimmed, settings.vaultDir)) {
        return { unchanged: true };
      }
      return { dir: trimmed };
    }
    const server = vaultForm.server.trim();
    const share = vaultForm.share.trim();
    const folder = vaultForm.folder.trim();
    const username = vaultForm.username.trim();
    if (!server || !share || /[\\/]/.test(server) || /[\\/]/.test(share)) {
      return { error: "Enter the SMB server and share name, without slashes." };
    }
    if (!username) return { error: "Enter the SMB username" };
    if (!vaultForm.password && !settings.smbPasswordSet) {
      return { error: "Enter the SMB password" };
    }
    const sameFolder = folder.replace(/\\/g, "/") === settings.smbFolder.replace(/\\/g, "/");
    if (
      settings.vaultKind === "smb" &&
      server === settings.smbServer &&
      share === settings.smbShare &&
      sameFolder &&
      username === settings.smbUsername &&
      vaultForm.password === ""
    ) {
      return { unchanged: true };
    }
    return {
      smb: {
        server,
        share,
        folder,
        username,
        password: vaultForm.password,
      },
    };
  }

  async function save(patch: {
    maxUploadMb?: number | null;
    vaultDir?: string | null;
    smb?: {
      server: string;
      share: string;
      folder: string;
      username: string;
      password: string;
    };
  }) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/system", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save system settings");
      setInput(String(settings.maxUploadMb));
      if (patch.vaultDir === null) applyVaultForm(settings);
      return;
    }
    setSettings(data.settings);
    setInput(String(data.settings.maxUploadMb));
    applyVaultForm(data.settings);
  }

  function commitLimit() {
    const trimmed = input.trim();
    if (!trimmed) {
      setInput(String(settings.maxUploadMb));
      return;
    }
    const mb = Number(trimmed);
    if (!Number.isInteger(mb) || mb < 1) {
      setError("Enter a whole number of megabytes");
      setInput(String(settings.maxUploadMb));
      return;
    }
    if (mb === settings.maxUploadMb && !settings.usesEnvDefault) {
      return;
    }
    if (settings.usesEnvDefault && mb === settings.envDefaultMb) {
      return;
    }
    void save({ maxUploadMb: mb });
  }

  function updateVault() {
    const pending = pendingVaultDir();
    if ("unchanged" in pending) return;
    if ("error" in pending) {
      setError(pending.error);
      return;
    }
    if ("smb" in pending) {
      void save({ smb: pending.smb });
      return;
    }
    void save({ vaultDir: pending.dir });
  }

  return (
    <div className="mt-6 max-w-2xl space-y-4">
      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Vault location</h2>
        <p className="mt-1 text-[13px] text-muted">
          Folder where project files are stored. A local folder is on this
          computer. An SMB share can be on another machine: the username and
          password are encrypted with the server secret before they are saved.
          Changing the path does not move existing files.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            updateVault();
          }}
        >
          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="radio"
              className="mt-1"
              name="vault-kind"
              checked={vaultForm.kind === "local"}
              disabled={busy}
              onChange={() => selectVaultKind("local")}
            />
            <span className="min-w-0 flex-1">
              <span className="block">Local folder</span>
              <input
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={vaultForm.localPath}
                disabled={busy || vaultForm.kind !== "local"}
                onChange={(event) => patchVault({ localPath: event.target.value })}
                className={`mt-1 ${fieldClass}`}
              />
            </span>
          </label>
          <div>
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="radio"
                className="mt-1"
                name="vault-kind"
                checked={vaultForm.kind === "smb"}
                disabled={busy}
                onChange={() => selectVaultKind("smb")}
              />
              <span className="block">SMB share</span>
            </label>
            <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-2">
              <label className="block">
                <FieldHint
                  label="Server"
                  hint="Hostname or IP address, such as nas or 192.168.1.20. Do not include slashes."
                />
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="server"
                  value={vaultForm.server}
                  disabled={busy || vaultForm.kind !== "smb"}
                  onChange={(event) => patchVault({ server: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <FieldHint
                  label="Share"
                  hint="Share name only, such as vault. Do not include the server or a folder."
                />
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="share"
                  value={vaultForm.share}
                  disabled={busy || vaultForm.kind !== "smb"}
                  onChange={(event) => patchVault({ share: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <FieldHint
                  label="Username"
                  hint="Account that can open the share, such as user or DOMAIN\\user."
                />
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="user"
                  value={vaultForm.username}
                  disabled={busy || vaultForm.kind !== "smb"}
                  onChange={(event) => patchVault({ username: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <FieldHint
                  label="Password"
                  hint="Password for that account. Leave this blank to keep a password that is already saved."
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    settings.smbPasswordSet
                      ? "Leave blank to keep the saved password"
                      : "Password"
                  }
                  value={vaultForm.password}
                  disabled={busy || vaultForm.kind !== "smb"}
                  onChange={(event) => patchVault({ password: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <FieldHint
                  label="Folder inside the share"
                  hint="Optional path under the share, such as origami or projects/active. Do not use . or .."
                />
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="optional"
                  value={vaultForm.folder}
                  disabled={busy || vaultForm.kind !== "smb"}
                  onChange={(event) => patchVault({ folder: event.target.value })}
                  className={fieldClass}
                />
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || "unchanged" in pendingVaultDir()}
              className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-canvas disabled:opacity-60"
            >
              Update
            </button>
            {settings.vaultDirUsesEnvDefault ? null : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void save({ vaultDir: null })}
                className="text-[12px] text-muted hover:text-ink disabled:opacity-60"
              >
                Reset to environment default
              </button>
            )}
          </div>
        </form>
        <p className="mt-2 text-[12px] text-muted">
          Current location:{" "}
          <span className="font-mono text-[11px] text-ink">
            {settings.vaultDir}
          </span>
          {settings.vaultDirUsesEnvDefault ? " (environment default)" : null}
        </p>
        {settings.smbError ? (
          <p className="mt-2 text-[12px] text-accent">{settings.smbError}</p>
        ) : null}
        <p className="mt-1 text-[12px] text-muted">
          Environment default:{" "}
          <span className="font-mono text-[11px] text-ink">
            {settings.vaultDirEnvDefault}
          </span>{" "}
          from{" "}
          <span className="font-mono text-[11px]">{settings.vaultDirEnvVar}</span>
          .
        </p>
        {settings.vaultHostDir ? (
          <p className="mt-1 text-[12px] text-muted">
            Docker host folder{" "}
            <span className="font-mono text-[11px]">{settings.vaultHostEnvVar}</span>{" "}
            is bind-mounted as that default:{" "}
            <span className="font-mono text-[11px] text-ink">
              {settings.vaultHostDir}
            </span>
            . That folder is the environment default. An SMB vault is mounted
            separately from the encrypted settings above.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Uploads</h2>
        <p className="mt-1 text-[13px] text-muted">
          Maximum size for each individual file uploaded to the vault. When you
          drop a folder or select many files, every file is checked separately;
          oversized files are skipped and the rest still upload.
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Max file size (MB)
          </span>
          <input
            type="number"
            min={1}
            max={settings.ceilingMb}
            step={1}
            value={input}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onBlur={commitLimit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="w-full max-w-xs rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
          />
        </label>
        <p className="mt-2 text-[12px] text-muted">
          Current limit: {formatLimit(settings.maxUploadMb)}
          {settings.usesEnvDefault ? " (environment default)" : null}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          Environment default: {formatLimit(settings.envDefaultMb)} from{" "}
          <span className="font-mono text-[11px]">ORIGAMI_MAX_UPLOAD_MB</span>.
          Settings cannot exceed this ceiling without changing the environment
          and restarting the app.
        </p>
        {settings.usesEnvDefault ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ maxUploadMb: null })}
            className="mt-3 self-start text-[12px] text-muted hover:text-ink disabled:opacity-60"
          >
            Reset to environment default
          </button>
        )}
      </section>

      {error ? <p className="text-[12px] text-accent">{error}</p> : null}
    </div>
  );
}
