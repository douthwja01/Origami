"use client";

import { useState } from "react";
import type { SystemUploadSettings } from "@/lib/upload-settings";

type Props = {
  initialSettings: SystemUploadSettings;
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

export function SystemSettings({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [input, setInput] = useState(String(initialSettings.maxUploadMb));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(maxUploadMb: number | null) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/system", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxUploadMb }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save system settings");
      setInput(String(settings.maxUploadMb));
      return;
    }
    setSettings(data.settings);
    setInput(String(data.settings.maxUploadMb));
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
    if (
      settings.usesEnvDefault &&
      mb === settings.envDefaultMb
    ) {
      return;
    }
    void save(mb);
  }

  return (
    <div className="mt-6 max-w-2xl space-y-4">
      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Uploads</h2>
        <p className="mt-1 text-[13px] text-muted">
          Maximum size for a single file uploaded to the vault. Applies
          immediately to new uploads.
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
            onClick={() => void save(null)}
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
