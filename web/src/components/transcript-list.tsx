"use client";

import { useEffect, useRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { timestamp } from "@/lib/format";
import type { TranscriptLine } from "@/lib/schema";
import { cn } from "@/lib/utils";

export function activeLineIndex(lines: TranscriptLine[], t: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (t >= lines[i].start) return t <= lines[i].end + 0.5 || i === lines.length - 1 ? i : -1;
  }
  return -1;
}

export function TranscriptList({
  lines,
  currentTime = 0,
  evidenceTimes = [],
  onSeek,
  className,
}: {
  lines: TranscriptLine[] | null;
  currentTime?: number;
  /** Timestamps cited by safety flags; matching lines get a warning highlight. */
  evidenceTimes?: number[];
  onSeek?: (seconds: number) => void;
  className?: string;
}) {
  const active = lines ? activeLineIndex(lines, currentTime) : -1;
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  if (lines === null) {
    return (
      <div className={cn("space-y-2", className)} aria-label="Transcript loading">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-5" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-sm", className)}>
        No speech detected in this video.
      </p>
    );
  }

  return (
    <ScrollArea className={cn("h-[320px] pr-3", className)}>
      <ol className="space-y-0.5">
        {lines.map((line, i) => {
          const evidence = evidenceTimes.some((t) => t >= line.start - 0.5 && t <= line.end + 0.5);
          return (
            <li key={`${line.start}-${i}`} className="animate-in fade-in duration-200">
              <button
                ref={i === active ? activeRef : undefined}
                type="button"
                onClick={() => onSeek?.(line.start)}
                aria-current={i === active ? "true" : undefined}
                className={cn(
                  "hover:bg-accent flex w-full gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150",
                  i === active && "bg-accent",
                  evidence && "bg-warning/10 border-warning rounded-l-none border-l-2",
                )}
              >
                <span className="text-muted-foreground shrink-0 pt-px font-mono text-xs tabular-nums">
                  {timestamp(line.start)}
                </span>
                <span>{line.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}
