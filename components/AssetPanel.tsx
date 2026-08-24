"use client";

import { useMemo, useState } from "react";
import { AssetPreview } from "@/components/AssetPreview";
import { formatBytes } from "@/lib/format";
import { inferKind } from "@/lib/kinds";
import type { AssetDTO, AssetKind } from "@/lib/types";

type Props = {
  projectId: string;
  kind: AssetKind;
  assets: AssetDTO[];
  onChanged: () => Promise<void>;
};

export function AssetPanel({ projectId, kind, assets, onChanged }: Props) {
  const [drag, setDrag] = useState(false);
  const [selected, setSelected] = useState<AssetDTO | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = useMemo(() => {
    if (selected && assets.some((a) => a.id === selected.id)) return selected;
    return assets[0] ?? null;
  }, [assets, selected]);

  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    for (const file of Array.from(files)) {
      setUploading(file.name);
      const form = new FormData();
      form.append("file", file);
      const inferred = inferKind(file.name);
      form.append("kind", inferred === kind ? inferred : kind);
      const res = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to upload ${file.name}`);
        break;
      }
      setSelected(data.asset);
    }
    setUploading(null);
    await onChanged();
  }

  async function remove(asset: AssetDTO) {
    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Delete failed");
      return;
    }
    if (selected?.id === asset.id) setSelected(null);
    await onChanged();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center ${
            drag ? "border-accent bg-overlay" : "border-line bg-raised"
          }`}
        >
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="text-[14px]">Drop files here</span>
          <span className="mt-1 text-[12px] text-muted">
            {uploading ? `Uploading ${uploading}…` : "or click to browse"}
          </span>
        </label>
        {error ? <p className="mb-3 text-[13px] text-accent">{error}</p> : null}
        {assets.length === 0 ? (
          <p className="text-[13px] text-muted">No files in this tab yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-raised">
            {assets.map((asset) => (
              <li key={asset.id} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setSelected(asset)}
                  className={`min-w-0 flex-1 text-left ${
                    current?.id === asset.id ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  <div className="truncate text-[13px]">{asset.filename}</div>
                  <div className="font-mono text-[11px] text-muted">
                    {formatBytes(asset.sizeBytes)}
                  </div>
                </button>
                <a
                  href={`/api/assets/${asset.id}?download=1`}
                  className="text-[12px] text-muted hover:text-ink"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => remove(asset)}
                  className="text-[12px] text-muted hover:text-accent"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="min-h-[320px] rounded-xl border border-line bg-raised">
        {current ? (
          <AssetPreview asset={current} />
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center text-[13px] text-muted">
            Select a file to preview
          </div>
        )}
      </div>
    </div>
  );
}
