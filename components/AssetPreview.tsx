"use client";

import dynamic from "next/dynamic";
import { CodeViewer } from "@/components/CodeViewer";
import {
  isArchive,
  isMarkdown,
  isPdf,
  isPreviewableAudio,
  isPreviewableImage,
  isPreviewableVideo,
  isStlOrObj,
  isTextLike,
} from "@/lib/kinds";
import { formatBytes } from "@/lib/format";
import type { AssetDTO } from "@/lib/types";

const CadViewer = dynamic(
  () => import("@/components/CadViewer").then((m) => m.CadViewer),
  { ssr: false, loading: () => <p className="p-4 text-[13px] text-muted">Loading viewer…</p> },
);

export function AssetPreview({ asset }: { asset: AssetDTO }) {
  const src = `/api/assets/${asset.id}`;
  const download = `${src}?download=1`;

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <div className="min-w-0">
          <div className="truncate text-[13px]">{asset.filename}</div>
          <div className="font-mono text-[11px] text-muted">
            {formatBytes(asset.sizeBytes)} · {asset.mimeType}
          </div>
        </div>
        <a href={download} className="shrink-0 text-[12px] text-accent">
          Download
        </a>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isPreviewableImage(asset.mimeType, asset.filename) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={asset.filename} className="mx-auto max-h-[70vh] object-contain p-4" />
        ) : isPreviewableVideo(asset.mimeType, asset.filename) ? (
          <video src={src} controls className="mx-auto max-h-[70vh] w-full p-4" />
        ) : isPreviewableAudio(asset.mimeType, asset.filename) ? (
          <div className="p-6">
            <audio src={src} controls className="w-full" />
          </div>
        ) : isPdf(asset.mimeType, asset.filename) ? (
          <iframe title={asset.filename} src={src} className="h-[70vh] w-full border-0" />
        ) : isStlOrObj(asset.filename) ? (
          <CadViewer url={src} filename={asset.filename} />
        ) : isTextLike(asset.mimeType, asset.filename) ? (
          <CodeViewer url={src} filename={asset.filename} markdown={isMarkdown(asset.filename)} />
        ) : isArchive(asset.filename) ? (
          <EmptyNote text="Archive stored in the vault. Download to extract." />
        ) : (
          <EmptyNote text="No inline preview for this format. Download to open it locally." />
        )}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-[13px] text-muted">
      {text}
    </div>
  );
}
