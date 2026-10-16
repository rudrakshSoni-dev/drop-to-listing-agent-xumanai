"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { Pause, Play, ShieldX } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { SourceBadge } from "@/components/source-badge";
import type { SourceType } from "@/lib/sources";
import { cn } from "@/lib/utils";

export const SWIPE_THRESHOLD = 120;

/** DESIGN §7: drag right to book, left to skip. The buttons below do the same. */
export function SwipeCard({
  thumbUrl,
  mediaUrl,
  sourceType,
  title,
  summary,
  chips,
  price,
  blocked,
  onBook,
  skipSignal = 0,
}: {
  thumbUrl: string | null;
  mediaUrl: string | null;
  sourceType: SourceType;
  title: string;
  summary: string;
  chips: ReactNode;
  price: string;
  blocked: boolean;
  onBook: () => void;
  /** Increment to play the skip animation (the Skip button). */
  skipSignal?: number;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const bookOpacity = useTransform(x, [40, SWIPE_THRESHOLD], [0, 1]);
  const skipOpacity = useTransform(x, [-SWIPE_THRESHOLD, -40], [1, 0]);
  const [playing, setPlaying] = useState(false);

  const skip = useCallback(() => {
    // It's a demo: the card leaves, then springs back.
    void animate(x, -480, { duration: reduceMotion ? 0 : 0.25 }).then(() =>
      setTimeout(() => void animate(x, 0, { type: "spring", stiffness: 300, damping: 26 }), 400),
    );
  }, [x, reduceMotion]);

  useEffect(() => {
    if (skipSignal > 0) skip();
  }, [skipSignal, skip]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD && !blocked) {
      onBook();
      void animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      skip();
    } else {
      void animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.8, right: blocked ? 0.08 : 0.8 }}
      onDragEnd={onDragEnd}
      style={{ x, rotate: reduceMotion ? 0 : rotate }}
      className="bg-muted absolute inset-x-3 top-16 bottom-24 cursor-grab touch-pan-y overflow-hidden rounded-3xl shadow-xl select-none active:cursor-grabbing"
      data-testid="swipe-card"
    >
      {playing && mediaUrl ? (
        <video
          src={mediaUrl}
          autoPlay
          muted
          loop
          playsInline
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      ) : thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- API-served jpg, sized by CSS
        <img
          src={thumbUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      <SourceBadge type={sourceType} className="absolute top-3 left-3" />
      {mediaUrl && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          onPointerDownCapture={(e) => e.stopPropagation()}
          aria-label={playing ? "Pause video" : "Play video"}
          className="focus-visible:ring-ring absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur outline-none focus-visible:ring-2"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      )}

      <motion.span
        style={{ opacity: bookOpacity }}
        className="border-success text-success absolute top-14 left-5 -rotate-12 rounded-lg border-4 px-3 py-1 text-2xl font-black tracking-widest"
        aria-hidden
      >
        BOOK
      </motion.span>
      <motion.span
        style={{ opacity: skipOpacity }}
        className="border-muted-foreground text-muted-foreground absolute top-14 right-5 rotate-12 rounded-lg border-4 px-3 py-1 text-2xl font-black tracking-widest"
        aria-hidden
      >
        SKIP
      </motion.span>

      <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-white">
        {blocked && (
          <p className="bg-destructive/90 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium">
            <ShieldX className="size-3.5 shrink-0" aria-hidden /> Not publishable: safety review
            needed.
          </p>
        )}
        <p className="line-clamp-2 text-lg leading-snug font-semibold">{title}</p>
        <p className="line-clamp-2 text-xs text-white/80">{summary}</p>
        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1">{chips}</div>
          <span className={cn("shrink-0 text-base font-bold tabular-nums")}>{price}</span>
        </div>
      </div>
    </motion.div>
  );
}
