"use client";

import { useEffect, useMemo, useState } from "react";
import { isPreviewableImage, isPreviewableVideo } from "@/lib/kinds";
import {
  DEFAULT_MEDIA_BACKGROUND_OPACITY,
  MEDIA_BACKGROUND_CYCLE_MS,
} from "@/lib/project-settings-types";
import type { AssetDTO, ProjectDTO } from "@/lib/types";

type Props = {
  project: ProjectDTO;
  assets: AssetDTO[];
};

function isBackgroundMedia(asset: AssetDTO) {
  return (
    asset.kind === "media" &&
    (isPreviewableImage(asset.mimeType, asset.filename) ||
      isPreviewableVideo(asset.mimeType, asset.filename))
  );
}

export function ProjectMediaBackground({ project, assets }: Props) {
  const [index, setIndex] = useState(0);

  const media = useMemo(
    () =>
      assets
        .filter(isBackgroundMedia)
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [assets],
  );

  const mediaIds = useMemo(
    () => media.map((item) => item.id).join("|"),
    [media],
  );

  useEffect(() => {
    setIndex(0);
  }, [mediaIds]);

  const cycling = Boolean(project.mediaBackgroundCycle && media.length > 1);

  useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % media.length);
    }, MEDIA_BACKGROUND_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [cycling, media.length]);

  if (!project.mediaBackground || media.length === 0) return null;

  const current = media[index % media.length];
  if (!current) return null;

  const opacity =
    (project.mediaBackgroundOpacity ?? DEFAULT_MEDIA_BACKGROUND_OPACITY) / 100;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <MediaSlide asset={current} opacity={opacity} />
    </div>
  );
}

function MediaSlide({ asset, opacity }: { asset: AssetDTO; opacity: number }) {
  const src = `/api/assets/${asset.id}`;
  const className =
    "absolute inset-0 h-full w-full object-cover transition-opacity duration-700";
  const style = { opacity };

  if (isPreviewableVideo(asset.mimeType, asset.filename)) {
    return (
      <video
        key={asset.id}
        src={src}
        className={className}
        style={style}
        muted
        playsInline
        autoPlay
        loop
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={asset.id} src={src} alt="" className={className} style={style} />
  );
}
