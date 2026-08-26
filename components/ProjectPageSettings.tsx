"use client";

import { useEffect, useState } from "react";
import type { ProjectDTO } from "@/lib/types";

type Props = {
  project: ProjectDTO;
  onSaved: () => Promise<void>;
};

export function ProjectPageSettings({ project, onSaved }: Props) {
  const [opacity, setOpacity] = useState(project.mediaBackgroundOpacity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpacity(project.mediaBackgroundOpacity);
  }, [project.mediaBackgroundOpacity]);

  async function save(patch: {
    mediaBackground?: boolean;
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

  function commitOpacity(value: number) {
    if (value === project.mediaBackgroundOpacity) return;
    void save({ mediaBackgroundOpacity: value });
  }

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
            When enabled, previewable images and video from this project vault
            sit behind the workspace. Cycling advances every 12 seconds.
          </p>

          <label className="mt-4 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={project.mediaBackground}
              disabled={busy}
              onChange={(event) =>
                void save({ mediaBackground: event.target.checked })
              }
            />
            Use media as project background
          </label>

          <label
            className={`mt-3 flex items-center gap-2 text-[13px] ${
              project.mediaBackground ? "" : "text-muted"
            }`}
          >
            <input
              type="checkbox"
              checked={project.mediaBackgroundCycle}
              disabled={busy || !project.mediaBackground}
              onChange={(event) =>
                void save({ mediaBackgroundCycle: event.target.checked })
              }
            />
            Cycle through media
          </label>

          <div
            className={`mt-4 ${project.mediaBackground ? "" : "opacity-50"}`}
          >
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
              disabled={busy || !project.mediaBackground}
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
