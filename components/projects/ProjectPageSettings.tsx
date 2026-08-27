"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaBackgroundMode } from "@/lib/projects/project-background";
import type { AssetDTO, ProjectDTO } from "@/lib/shared/types";

type Props = {
  project: ProjectDTO;
  onSaved: () => Promise<void>;
  backgroundAsset: AssetDTO | null;
};

export function ProjectPageSettings({ project, onSaved, backgroundAsset }: Props) {
  const [opacity, setOpacity] = useState(project.mediaBackgroundOpacity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOpacity(project.mediaBackgroundOpacity);
  }, [project.mediaBackgroundOpacity]);

  async function save(patch: {
    mediaBackgroundMode?: MediaBackgroundMode;
    mediaBackgroundCycle?: boolean;
    mediaBackgroundOpacity?: number;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not save project settings");
      }
      if (typeof data.project?.mediaBackgroundOpacity === "number") {
        setOpacity(data.project.mediaBackgroundOpacity);
      }
      await onSaved();
    } catch (err) {
      setError((err as Error).message || "Could not save project settings");
      setOpacity(project.mediaBackgroundOpacity);
    } finally {
      setBusy(false);
    }
  }

  async function uploadBackground(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${project.id}/background`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not upload background");
      }
      await onSaved();
    } catch (err) {
      setError((err as Error).message || "Could not upload background");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeBackground() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/background`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not remove background");
      }
      await onSaved();
    } catch (err) {
      setError((err as Error).message || "Could not remove background");
    } finally {
      setBusy(false);
    }
  }

  function commitOpacity(value: number) {
    if (value === project.mediaBackgroundOpacity) return;
    void save({ mediaBackgroundOpacity: value });
  }

  const backgroundEnabled = project.mediaBackgroundMode !== "off";
  const vaultMode = project.mediaBackgroundMode === "vault";
  const fixedMode = project.mediaBackgroundMode === "fixed";

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="max-w-2xl space-y-4">
        <div>
          <h2 className="text-[16px] font-medium tracking-tight">Project settings</h2>
          <p className="mt-1 text-[13px] text-muted">
            These options apply only to {project.code}.
          </p>
        </div>
        <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
          <h2 className="text-[13px] font-medium">Background</h2>
          <p className="mt-1 text-[13px] text-muted">
            Choose a fixed image or previewable media from this project vault.
            Vault cycling crossfades every 12 seconds.
          </p>

          <fieldset className="mt-4 space-y-2 text-[13px]" disabled={busy}>
            <legend className="sr-only">Background source</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="background-mode"
                checked={project.mediaBackgroundMode === "off"}
                onChange={() => void save({ mediaBackgroundMode: "off" })}
              />
              None
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="background-mode"
                checked={vaultMode}
                onChange={() => void save({ mediaBackgroundMode: "vault" })}
              />
              Vault media
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="background-mode"
                checked={fixedMode}
                onChange={() => void save({ mediaBackgroundMode: "fixed" })}
              />
              Fixed image
            </label>
          </fieldset>

          {vaultMode ? (
            <label className="mt-3 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={project.mediaBackgroundCycle}
                disabled={busy}
                onChange={(event) =>
                  void save({ mediaBackgroundCycle: event.target.checked })
                }
              />
              Cycle through media
            </label>
          ) : null}

          {fixedMode ? (
            <div className="mt-4 space-y-3">
              {backgroundAsset ? (
                <div className="overflow-hidden rounded-md border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${backgroundAsset.id}`}
                    alt=""
                    className="max-h-40 w-full object-cover"
                  />
                </div>
              ) : (
                <p className="text-[12px] text-muted">
                  Upload an image to use as the project background.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-overlay disabled:opacity-50"
                >
                  {backgroundAsset ? "Replace image" : "Upload image"}
                </button>
                {backgroundAsset ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeBackground()}
                    className="rounded-md border border-line px-3 py-1.5 text-[12px] text-accent hover:bg-overlay disabled:opacity-50"
                  >
                    Remove image
                  </button>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadBackground(file);
                }}
              />
            </div>
          ) : null}

          <div className={`mt-4 ${backgroundEnabled ? "" : "opacity-50"}`}>
            <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
              <span>Opacity</span>
              <span className="font-mono text-ink">{opacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacity}
              disabled={busy || !backgroundEnabled}
              onChange={(event) => setOpacity(Number(event.target.value))}
              onPointerUp={(event) =>
                commitOpacity(Number((event.target as HTMLInputElement).value))
              }
              onKeyUp={(event) =>
                commitOpacity(Number((event.target as HTMLInputElement).value))
              }
              className="mt-2 w-full"
            />
          </div>
        </section>

        {error ? <p className="text-[12px] text-accent">{error}</p> : null}
      </div>
    </div>
  );
}
