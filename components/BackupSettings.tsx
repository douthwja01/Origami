"use client";

import { useEffect, useState } from "react";
import { formatBytes } from "@/lib/format";
import {
  BACKUP_INTERVAL_UNITS,
  BACKUP_RETENTION_AGE_UNITS,
  backupUnitLabel,
  retentionAgeUnitLabel,
  type BackupIntervalUnit,
  type BackupPassResult,
  type BackupRetentionAgeUnit,
  type BackupRetentionMode,
  type BackupSettings,
  type ProjectBackupDTO,
} from "@/lib/backup-types";

type Props = {
  initialSettings: BackupSettings;
  backupDir: string;
  runs: ProjectBackupDTO[];
};

export function BackupSettings({ initialSettings, backupDir, runs }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [countInput, setCountInput] = useState(String(initialSettings.intervalCount));
  const [retentionInput, setRetentionInput] = useState(
    String(initialSettings.retentionCount),
  );
  const [history, setHistory] = useState(runs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BackupPassResult | null>(
    initialSettings.lastSummary,
  );

  useEffect(() => {
    setCountInput(String(settings.intervalCount));
  }, [settings.intervalCount]);

  useEffect(() => {
    setRetentionInput(String(settings.retentionCount));
  }, [settings.retentionCount]);

  async function refreshHistory() {
    const list = await fetch("/api/settings/backups");
    const next = await list.json();
    if (list.ok) setHistory(next.runs);
  }

  async function save(patch: {
    enabled?: boolean;
    intervalCount?: number;
    intervalUnit?: BackupIntervalUnit;
    retentionMode?: BackupRetentionMode;
    retentionCount?: number;
    retentionUnit?: BackupRetentionAgeUnit;
    nestFolders?: boolean;
  }) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/backups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save backup settings");
      return;
    }
    setSettings(data.settings);
    if (
      patch.retentionMode !== undefined ||
      patch.retentionCount !== undefined ||
      patch.retentionUnit !== undefined
    ) {
      await refreshHistory();
    }
  }

  function commitCount() {
    const parsed = Math.floor(Number(countInput));
    const count = Number.isFinite(parsed) ? Math.min(999, Math.max(1, parsed)) : 1;
    setCountInput(String(count));
    if (count !== settings.intervalCount) {
      void save({ intervalCount: count });
    }
  }

  function commitRetention() {
    const parsed = Math.floor(Number(retentionInput));
    const count = Number.isFinite(parsed) ? Math.min(999, Math.max(1, parsed)) : 1;
    setRetentionInput(String(count));
    if (count !== settings.retentionCount) {
      void save({ retentionCount: count });
    }
  }

  async function runNow() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Backup pass failed");
      return;
    }
    setSettings(data.settings);
    setResult(data.result);
    await refreshHistory();
  }

  return (
    <div className="mt-6 max-w-2xl space-y-4">
      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Scheduled project backups</h2>
        <p className="mt-1 text-[13px] text-muted">
          On each interval, Origami backs up a project only if its checksum
          changed since the last backup. Archived projects are skipped —
          archiving a project writes a backup immediately instead. Retention
          can keep a fixed number of backups per project, or drop archives
          older than a week, month, year, or decade. At least one backup per
          project is always kept. Archives are named{" "}
          <span className="font-mono text-[12px] text-ink">
            2026-08-25@15-26-02 PROJ-001.tar.gz
          </span>{" "}
          and written outside Docker to{" "}
          <span className="font-mono text-[12px] text-ink">{backupDir}</span>
          .
        </p>

        <label className="mt-4 flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={busy}
            onChange={(event) => void save({ enabled: event.target.checked })}
          />
          Enable scheduled backups
        </label>

        <label className="mt-3 flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={settings.nestFolders}
            disabled={busy}
            onChange={(event) => void save({ nestFolders: event.target.checked })}
          />
          Nest each project&apos;s backups in its own folder
        </label>

        <div className="mt-3">
          <div className="text-[12px] text-muted">Every</div>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min={1}
              max={999}
              step={1}
              value={countInput}
              disabled={busy}
              onChange={(event) => setCountInput(event.target.value)}
              onBlur={commitCount}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitCount();
                }
              }}
              className="w-24 rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink"
            />
            <select
              value={settings.intervalUnit}
              disabled={busy}
              onChange={(event) =>
                void save({
                  intervalUnit: event.target.value as BackupIntervalUnit,
                })
              }
              className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink"
            >
              {BACKUP_INTERVAL_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {backupUnitLabel(unit, Number(countInput) || settings.intervalCount)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[12px] text-muted">Retention</div>
          <label className="mt-2 flex items-start gap-2 text-[13px]">
            <input
              type="radio"
              className="mt-0.5"
              name="retention-mode"
              checked={settings.retentionMode === "count"}
              disabled={busy}
              onChange={() => void save({ retentionMode: "count" })}
            />
            <span className="min-w-0 flex-1">
              <span className="block">Keep a fixed number of backups</span>
              <input
                type="number"
                min={1}
                max={999}
                step={1}
                value={retentionInput}
                disabled={busy || settings.retentionMode !== "count"}
                onChange={(event) => setRetentionInput(event.target.value)}
                onBlur={commitRetention}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRetention();
                  }
                }}
                className="mt-1 w-24 rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink disabled:opacity-50"
              />
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-[13px]">
            <input
              type="radio"
              className="mt-0.5"
              name="retention-mode"
              checked={settings.retentionMode === "age"}
              disabled={busy}
              onChange={() => void save({ retentionMode: "age" })}
            />
            <span className="min-w-0 flex-1">
              <span className="block">Delete backups older than</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={retentionInput}
                  disabled={busy || settings.retentionMode !== "age"}
                  onChange={(event) => setRetentionInput(event.target.value)}
                  onBlur={commitRetention}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRetention();
                    }
                  }}
                  className="w-24 rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink disabled:opacity-50"
                />
                <select
                  value={settings.retentionUnit}
                  disabled={busy || settings.retentionMode !== "age"}
                  onChange={(event) =>
                    void save({
                      retentionUnit: event.target.value as BackupRetentionAgeUnit,
                    })
                  }
                  className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink disabled:opacity-50"
                >
                  {BACKUP_RETENTION_AGE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {retentionAgeUnitLabel(
                        unit,
                        Number(retentionInput) || settings.retentionCount,
                      )}
                    </option>
                  ))}
                </select>
              </div>
            </span>
          </label>
        </div>

        <div className="mt-3 text-[12px] text-muted">
          {settings.lastRunAt ? (
            <p>Last run {formatWhen(settings.lastRunAt)}</p>
          ) : (
            <p>No scheduled run yet.</p>
          )}
          {result ? (
            <p className="mt-1">
              Last pass: {result.backedUp} written, {result.skipped} skipped
              {result.failed ? `, ${result.failed} failed` : ""}
              {result.pruned ? `, ${result.pruned} pruned` : ""}
            </p>
          ) : null}
        </div>

        {error ? <p className="mt-2 text-[12px] text-accent">{error}</p> : null}
        {result?.errors.length ? (
          <ul className="mt-2 space-y-1 text-[12px] text-accent">
            {result.errors.map((item) => (
              <li key={item.code}>
                {item.code}: {item.error}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runNow()}
            className="btn-accent"
          >
            Run now
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Recent project archives</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">
            No project backups stored yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {history.map((run) => (
              <li
                key={run.id}
                className="flex items-center justify-between gap-3 py-2 text-[13px]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12px]">
                    {run.code}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {run.storagePath}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono text-[11px] text-muted">
                  {formatWhen(run.createdAt)}
                  <br />
                  {formatBytes(run.sizeBytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
