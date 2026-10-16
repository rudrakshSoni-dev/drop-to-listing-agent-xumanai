"use client";

import type { RefObject } from "react";

import { SourceBadge } from "@/components/source-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timestamp } from "@/lib/format";
import type { SourceType } from "@/lib/sources";
import { cn } from "@/lib/utils";

export function VideoPanel({
  videoRef,
  src,
  captionsSrc,
  width,
  height,
  sourceType,
  durationS,
  onTimeUpdate,
  className,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string | null;
  captionsSrc?: string;
  width?: number | null;
  height?: number | null;
  sourceType: SourceType;
  durationS?: number | null;
  onTimeUpdate?: (seconds: number) => void;
  className?: string;
}) {
  const portrait = width && height ? height >= width : true;
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
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            preload="metadata"
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
