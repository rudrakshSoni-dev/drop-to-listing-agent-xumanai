"use client";

import {
  BatteryFull,
  Calendar,
  MapPin,
  Shuffle,
  Signal,
  SlidersHorizontal,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import { useWatch } from "react-hook-form";

import { BookDialog } from "@/components/book-dialog";
import { SwipeCard } from "@/components/swipe-card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiUrl } from "@/lib/api";
import { CATEGORIES } from "@/lib/categories";
import { ageLabel, GROUP_LABELS, priceLabel } from "@/lib/format";
import type { ListingFormValues } from "@/lib/listing-form";
import type { Listing } from "@/lib/schema";

const MODE_ICONS = { virtual: Video, in_person: MapPin, hybrid: Shuffle } as const;

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
      {children}
    </span>
  );
}

/** The marketplace booking card in a CSS phone frame (DESIGN §7), live from the form. */
export function BookingPreview({
  listing,
  mediaUrl,
  onBeforeBook,
  onSetAvailability,
}: {
  listing: Listing;
  mediaUrl: string | null;
  onBeforeBook?: () => Promise<boolean>;
  onSetAvailability?: () => void;
}) {
  const values = useWatch<ListingFormValues>() as ListingFormValues;
  const [open, setOpen] = useState(false);
  const [skips, setSkips] = useState(0);
  const blocked = listing.guardrails.status === "block";
  const ModeIcon = MODE_ICONS[values.format.mode];
  const thumb = values.thumbnail_frame
    ? apiUrl(`/api/media/${listing.id}/${values.thumbnail_frame}`)
    : null;

  const bookButton = (
    <Button
      size="icon"
      aria-label="Book this session"
      disabled={blocked}
      onClick={() => setOpen(true)}
      className="bg-brand-gradient size-14 rounded-full text-white shadow-lg shadow-primary/30 hover:opacity-90"
    >
      <Calendar className="size-6" />
    </Button>
  );

  return (
    <>
      <div className="border-secondary bg-background relative mx-auto h-[640px] w-[320px] max-w-full overflow-hidden rounded-[2.5rem] border-[10px] shadow-2xl shadow-primary/10">
        <div className="bg-secondary absolute top-0 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-b-2xl" />
        <div className="text-muted-foreground flex items-center justify-between px-6 pt-1.5 font-mono text-[10px]">
          <span>9:41</span>
          <span className="flex items-center gap-1" aria-hidden>
            <Signal className="size-3" /> <Wifi className="size-3" />{" "}
            <BatteryFull className="size-3.5" />
          </span>
        </div>
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-lg font-semibold">Discover</span>
          <SlidersHorizontal className="text-muted-foreground size-4" aria-hidden />
        </div>

        <SwipeCard
          thumbUrl={thumb}
          mediaUrl={mediaUrl}
          sourceType={listing.source.type}
          title={values.title || "Untitled listing"}
          summary={values.summary}
          price={priceLabel(values.session.price_band)}
          blocked={blocked}
          onBook={() => setOpen(true)}
          skipSignal={skips}
          chips={
            <>
              <Chip>{CATEGORIES[values.category].label}</Chip>
              <Chip>{ageLabel(values.age_range)}</Chip>
              <Chip>{GROUP_LABELS[values.format.group]}</Chip>
              <Chip>
                <ModeIcon className="size-3" aria-label={values.format.mode} />
              </Chip>
            </>
          }
        />

        <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-6">
          <Button
            variant="outline"
            size="icon"
            aria-label="Skip"
            onClick={() => setSkips((n) => n + 1)}
            className="size-12 rounded-full"
          >
            <X className="size-5" />
          </Button>
          {blocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="rounded-full">
                  {bookButton}
                </span>
              </TooltipTrigger>
              <TooltipContent>Resolve high-severity flags to publish.</TooltipContent>
            </Tooltip>
          ) : (
            bookButton
          )}
        </div>
      </div>
      <p className="text-muted-foreground mt-3 text-center text-xs">
        Swipe right to book, left to skip · demo, nothing is charged
      </p>

      <BookDialog
        open={open}
        onOpenChange={setOpen}
        listingId={listing.id}
        values={values}
        onBeforeBook={onBeforeBook}
        onSetAvailability={onSetAvailability}
      />
    </>
  );
}
