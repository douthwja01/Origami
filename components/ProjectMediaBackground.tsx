"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isPreviewableImage, isPreviewableVideo } from "@/lib/kinds";
import {
  DEFAULT_MEDIA_BACKGROUND_OPACITY,
  MEDIA_BACKGROUND_CROSSFADE_MS,
  MEDIA_BACKGROUND_CYCLE_MS,
} from "@/lib/project-settings-types";
import type { AssetDTO, ProjectDTO } from "@/lib/types";

type Props = {
  project: ProjectDTO;
  assets: AssetDTO[];
};

type Layer = {
  key: number;
  asset: AssetDTO;
  visible: boolean;
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
  const [layers, setLayers] = useState<Layer[]>([]);
  const layerSeq = useRef(0);

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
    setLayers([]);
    layerSeq.current = 0;
  }, [mediaIds]);

  const cycling = Boolean(project.mediaBackgroundCycle && media.length > 1);

  useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % media.length);
    }, MEDIA_BACKGROUND_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [cycling, media.length]);

  const current = media.length > 0 ? media[index % media.length] : null;
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (!current) return;

    let fadeFrame = 0;
    let pruneTimer = 0;
    const incomingId = current.id;
    layerSeq.current += 1;
    const nextKey = layerSeq.current;

    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top?.asset.id === incomingId && top.visible) return prev;
      const outgoing = prev.map((layer) => ({ ...layer, visible: false }));
      return [...outgoing, { key: nextKey, asset: current, visible: false }].slice(
        -3,
      );
    });

    fadeFrame = window.requestAnimationFrame(() => {
      fadeFrame = window.requestAnimationFrame(() => {
        setLayers((prev) =>
          prev.map((layer) =>
            layer.key === nextKey
              ? { ...layer, visible: true }
              : { ...layer, visible: false },
          ),
        );
      });
    });

    pruneTimer = window.setTimeout(() => {
      setLayers((prev) => {
        const visible = prev.filter((layer) => layer.visible);
        return visible.length > 0 ? visible.slice(-1) : prev.slice(-1);
      });
    }, MEDIA_BACKGROUND_CROSSFADE_MS + 80);

    return () => {
      window.cancelAnimationFrame(fadeFrame);
      window.clearTimeout(pruneTimer);
    };
  }, [current, currentId]);

  if (!project.mediaBackground || media.length === 0 || !current) return null;

  const opacity =
    (project.mediaBackgroundOpacity ?? DEFAULT_MEDIA_BACKGROUND_OPACITY) / 100;

  const shown =
    layers.length > 0
      ? layers
      : [{ key: 0, asset: current, visible: true }];

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {shown.map((layer) => (
        <MediaSlide
          key={layer.key}
          asset={layer.asset}
          opacity={layer.visible ? opacity : 0}
        />
      ))}
    </div>
  );
}

function MediaSlide({ asset, opacity }: { asset: AssetDTO; opacity: number }) {
  const src = `/api/assets/${asset.id}`;
  const className = "absolute inset-0 h-full w-full object-cover";
  const style = {
    opacity,
    transition: `opacity ${MEDIA_BACKGROUND_CROSSFADE_MS}ms ease-in-out`,
  };

  if (isPreviewableVideo(asset.mimeType, asset.filename)) {
    return (
      <video
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
    <img src={src} alt="" className={className} style={style} />
  );
}
