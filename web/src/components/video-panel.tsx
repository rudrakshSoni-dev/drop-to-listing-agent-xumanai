"use client";

import type { ReactNode, RefObject } from "react";

import { SourceBadge } from "@/components/source-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timestamp } from "@/lib/format";
import { youtubeId, type SourceType } from "@/lib/sources";
import { cn } from "@/lib/utils";

export function VideoPanel({
  videoRef,
  src,
  captionsSrc,
  poster,
  sourceUrl,
  embedStart,
  width,
  height,
  sourceType,
  durationS,
  onTimeUpdate,
  className,
  children,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string | null;
  captionsSrc?: string;
  /** Shown before playback; many clips open on a black frame. */
  poster?: string | null;
  /** Used when there's no local file (pre-processed examples): play the platform embed. */
  sourceUrl?: string | null;
  /** Seek target for the embed (it can't be scripted like a <video>). */
  embedStart?: number | null;
  width?: number | null;
  height?: number | null;
  sourceType: SourceType;
  durationS?: number | null;
  onTimeUpdate?: (seconds: number) => void;
  className?: string;
  /** Rendered under the video, e.g. the FrameStrip. */
  children?: ReactNode;
}) {
  const portrait = width && height ? height >= width : true;
  const embedId = youtubeId(sourceUrl);
  const aspect = width && height ? `${width} / ${height}` : portrait ? "9 / 16" : "16 / 9";

  return (
    <Card className={cn("gap-3 p-3", className)}>
      <div
        className={cn(
          "bg-muted relative mx-auto w-full overflow-hidden rounded-lg",
          portrait && "max-w-xs",
        )}
        style={{ aspectRatio: aspect }}
      >
        {!src && embedId ? (
          <iframe
            key={embedStart ?? "start"}
            src={`https://www.youtube-nocookie.com/embed/${embedId}?rel=0${
              embedStart != null ? `&start=${Math.floor(embedStart)}&autoplay=1` : ""
            }`}
            title="Source video"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="size-full border-0"
          />
        ) : src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            preload="metadata"
            poster={poster ?? undefined}
            crossOrigin="anonymous"
            onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
            className="size-full bg-black object-contain"
          >
            {captionsSrc && (
              <track kind="captions" src={captionsSrc} srcLang="en" label="English" default />
            )}
          </video>
        ) : (
          <Skeleton className="size-full rounded-lg" />
        )}
      </div>
      {children}
      <div className="flex items-center justify-between">
        <SourceBadge type={sourceType} />
        {durationS ? (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {timestamp(durationS)}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
