"use client";

import { useRef, useState } from "react";
import { useProjectDisplay } from "@/components/settings/ProjectDisplayContext";
import { VAULT_NAME_MAX } from "@/lib/settings/project-settings-types";

export function ProjectSettings() {
  const { settings, save: saveSettings, applySettings } = useProjectDisplay();
  const [vaultName, setVaultName] = useState(settings.vaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function uploadLogo(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/projects/logo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not upload vault logo");
      }
      applySettings(data.settings);
    } catch (err) {
      setError((err as Error).message || "Could not upload vault logo");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/projects/logo", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not remove vault logo");
      }
      applySettings(data.settings);
    } catch (err) {
      setError((err as Error).message || "Could not remove vault logo");
    } finally {
      setBusy(false);
    }
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

        <div className="mt-4">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Logo
          </span>
          <p className="text-[12px] text-muted">
            Shown on home thumbnails when a project has no media. Defaults to the
            Origami mark.
          </p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.vaultLogoUrl}
                alt=""
                className="max-h-12 max-w-12 object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-overlay disabled:opacity-50"
              >
                {settings.hasCustomVaultLogo ? "Replace logo" : "Upload logo"}
              </button>
              {settings.hasCustomVaultLogo ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeLogo()}
                  className="rounded-md border border-line px-3 py-1.5 text-[12px] text-accent hover:bg-overlay disabled:opacity-50"
                >
                  Reset to default
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadLogo(file);
            }}
          />
        </div>
      </section>

      <p className="text-[12px] text-muted">
        Media background is set on each project, from Settings on the project
        page.
      </p>

      {error ? <p className="text-[12px] text-accent">{error}</p> : null}
    </div>
  );
}
