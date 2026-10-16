"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiUrl } from "@/lib/api";
import { timestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StripFrame {
  file: string;
  t: number;
}

/**
 * Key frames under the video. Read-only while processing; in the editor, picking
 * one sets the listing thumbnail (DESIGN §5 FrameStrip).
 */
export function FrameStrip({
  dropId,
  frames,
  selected,
  onSelect,
  loading = false,
  portrait = true,
}: {
  dropId: string;
  frames: StripFrame[] | null;
  selected?: string | null;
  onSelect?: (file: string) => void;
  loading?: boolean;
  portrait?: boolean;
}) {
  const aspect = portrait ? "aspect-[9/16] w-12" : "aspect-video w-20";

  if (!frames || frames.length === 0) {
    if (!loading) return null;
    return (
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={cn("shrink-0 rounded-md", aspect)} />
        ))}
      </div>
    );
  }

  const thumbs = frames.map((frame) => (
    // eslint-disable-next-line @next/next/no-img-element -- API-served jpgs, sized by CSS
    <img
      key={frame.file}
      src={apiUrl(`/api/media/${dropId}/${frame.file}`)}
      alt=""
      loading="lazy"
      className="size-full rounded-[inherit] object-cover"
    />
  ));

  if (!onSelect) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Key frames">
        {frames.map((frame, i) => (
          <div
            key={frame.file}
            className={cn("bg-muted shrink-0 overflow-hidden rounded-md", aspect)}
          >
            {thumbs[i]}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs">Thumbnail · pick a frame</p>
      <ToggleGroup
        type="single"
        value={selected ?? ""}
        onValueChange={(value) => value && onSelect(value)}
        className="flex w-full gap-2 overflow-x-auto pb-1"
        aria-label="Listing thumbnail"
      >
        {frames.map((frame, i) => (
          <ToggleGroupItem
            key={frame.file}
            value={frame.file}
            aria-label={`Frame at ${timestamp(frame.t)}`}
            className={cn(
              "relative h-auto shrink-0 overflow-hidden rounded-md p-0 data-[state=on]:ring-2 data-[state=on]:ring-primary",
              aspect,
            )}
          >
            {thumbs[i]}
            {selected === frame.file && (
              <span className="bg-primary text-primary-foreground absolute inset-x-0 bottom-0 text-center text-[9px] font-medium">
                Thumbnail
              </span>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
