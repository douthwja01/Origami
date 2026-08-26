"use client";

import { useState } from "react";
import { useProjectDisplay } from "@/components/ProjectDisplayContext";
import { VAULT_NAME_MAX } from "@/lib/project-settings-types";

export function ProjectSettings() {
  const { settings, save: saveSettings } = useProjectDisplay();
  const [vaultName, setVaultName] = useState(settings.vaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { vaultName?: string }) {
    setBusy(true);
    setError(null);
    try {
      const next = await saveSettings(patch);
      setVaultName(next.vaultName);
    } catch (err) {
      setError((err as Error).message || "Could not save project settings");
      setVaultName(settings.vaultName);
    } finally {
      setBusy(false);
    }
  }

  function commitName() {
    const next = vaultName.trim().replace(/\s+/g, " ");
    if (!next || next === settings.vaultName) {
      setVaultName(settings.vaultName);
      return;
    }
    void save({ vaultName: next });
  }

  return (
    <div className="mt-6 max-w-2xl space-y-4">
      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Vault</h2>
        <p className="mt-1 text-[13px] text-muted">
          This name is the home title and the back-link into the vault.
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Name
          </span>
          <input
            value={vaultName}
            maxLength={VAULT_NAME_MAX}
            disabled={busy}
            onChange={(event) => setVaultName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
          />
        </label>
      </section>

      <p className="text-[12px] text-muted">
        Media background is set on each project, from Settings on the project
        page.
      </p>

      {error ? <p className="text-[12px] text-accent">{error}</p> : null}
    </div>
  );
}
