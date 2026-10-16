"use client";

import { format, parseISO } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarPlus, CalendarX2, CheckCircle2, Loader2 } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PricePill } from "@/components/price-pill";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BREAKPOINTS, useMediaQuery } from "@/hooks/use-media-query";
import { api, ApiError, type BookingConfirmation } from "@/lib/api";
import { bookableDays, buildIcs, downloadFile, isoDate, startTimes } from "@/lib/booking";
import { errorCopy } from "@/lib/errors";
import { GROUP_LABELS, MODE_LABELS } from "@/lib/format";
import type { ListingFormValues } from "@/lib/listing-form";

const BOOKING_ERRORS: Record<string, string> = {
  SLOT_TAKEN: "Someone just booked that time. Pick another.",
  SLOT_UNAVAILABLE: "That time isn't available any more. Pick another.",
  LISTING_BLOCKED: "This listing needs a safety review before it can be booked.",
  NO_AVAILABILITY: "This Guide hasn't set availability yet.",
};

export function BookDialog({
  open,
  onOpenChange,
  listingId,
  values,
  onBeforeBook,
  onSetAvailability,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  values: ListingFormValues;
  /** Saves unsaved editor changes first; resolves false if they can't be saved. */
  onBeforeBook?: () => Promise<boolean>;
  /** Shown only where the availability field is on screen (desktop editor). */
  onSetAvailability?: () => void;
}) {
  const desktop = useMediaQuery(`(min-width: ${BREAKPOINTS.md}px)`, true);
  // Closing a dialog returns focus to its trigger; "Set availability" wants the field instead.
  const afterClose = useRef<(() => void) | null>(null);
  const setAvailability = onSetAvailability
    ? () => {
        afterClose.current = onSetAvailability;
        onOpenChange(false);
      }
    : undefined;
  const title = `Book ${values.title || "this session"}`;
  const body = (
    <BookingFlow
      key={String(open)}
      listingId={listingId}
      values={values}
      onBeforeBook={onBeforeBook}
      onSetAvailability={setAvailability}
      onDone={() => onOpenChange(false)}
    />
  );
  const guide = (
    <span className="flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarFallback className="bg-brand-gradient text-[10px] font-semibold text-white">
          DG
        </AvatarFallback>
      </Avatar>
      Demo Guide
    </span>
  );

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-md"
          onCloseAutoFocus={(e) => {
            const next = afterClose.current;
            if (!next) return;
            afterClose.current = null;
            e.preventDefault();
            next();
          }}
        >
          <DialogHeader>
            <DialogTitle className="line-clamp-2">{title}</DialogTitle>
            <DialogDescription asChild>
              <div>{guide}</div>
            </DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="line-clamp-2">{title}</DrawerTitle>
          <DrawerDescription asChild>
            <div>{guide}</div>
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}

function BookingFlow({
  listingId,
  values,
  onBeforeBook,
  onSetAvailability,
  onDone,
}: {
  listingId: string;
  values: ListingFormValues;
  onBeforeBook?: () => Promise<boolean>;
  onSetAvailability?: () => void;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const today = useMemo(() => new Date(), []);
  const days = useMemo(
    () => bookableDays(values.availability, today),
    [values.availability, today],
  );
  const [day, setDay] = useState<Date | undefined>(days[0]);
  const [start, setStart] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<BookingConfirmation | null>(null);
  const times = day ? startTimes(values.availability, day) : [];
  const bookable = new Set(days.map(isoDate));

  if (!values.availability?.length || days.length === 0) {
    return (
      <EmptyState
        icon={CalendarX2}
        message="This Guide hasn't set availability yet."
        action={
          onSetAvailability ? (
            <Button onClick={onSetAvailability}>Set availability</Button>
          ) : undefined
        }
      />
    );
  }

  if (confirmed) {
    const starts = parseISO(confirmed.starts_at);
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center" role="status">
        <motion.div
          initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          <CheckCircle2 className="text-success size-16" aria-hidden />
        </motion.div>
        <div>
          <p className="text-xl font-semibold">You&apos;re booked</p>
          <p className="text-muted-foreground">
            {format(starts, "EEEE d MMMM")} · {format(starts, "HH:mm")}–
            {format(parseISO(confirmed.ends_at), "HH:mm")}
          </p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {confirmed.confirmation_id}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() =>
              downloadFile(
                `${confirmed.confirmation_id}.ics`,
                buildIcs({
                  uid: confirmed.confirmation_id,
                  title: values.title,
                  description: `${values.summary}\n\nDemo booking via Drop2List.`,
                  startsAt: confirmed.starts_at,
                  endsAt: confirmed.ends_at,
                }),
              )
            }
          >
            <CalendarPlus /> Add to calendar
          </Button>
          <Button className="flex-1" onClick={onDone}>
            Done
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Demo only: no one is notified and nothing is charged.
        </p>
      </div>
    );
  }

  async function confirm() {
    if (!day || !start) return;
    setSubmitting(true);
    try {
      if (onBeforeBook && !(await onBeforeBook())) return;
      setConfirmed(await api.book(listingId, { date: isoDate(day), start }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      toast.error((code && BOOKING_ERRORS[code]) || errorCopy(code).title);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Calendar
        mode="single"
        selected={day}
        onSelect={(d) => {
          setDay(d);
          setStart("");
        }}
        disabled={(d) => !bookable.has(isoDate(d))}
        startMonth={days[0]}
        endMonth={days[days.length - 1]}
        defaultMonth={days[0]}
        className="mx-auto rounded-lg border"
      />
      <Section label={day ? format(day, "EEEE d MMMM") : "Pick a day"}>
        {times.length > 0 ? (
          <ToggleGroup
            type="single"
            value={start}
            onValueChange={setStart}
            variant="outline"
            className="flex w-full flex-wrap gap-2"
            aria-label="Start time"
          >
            {times.map((t) => (
              <ToggleGroupItem key={t} value={t} className="rounded-full px-4 font-mono">
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <p className="text-muted-foreground text-sm">No times on this day.</p>
        )}
      </Section>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {GROUP_LABELS[values.format.group]} · {MODE_LABELS[values.format.mode]}
        </span>
        <PricePill band={values.session.price_band} durationMin={values.session.duration_min} />
      </div>
      <Button
        className="w-full"
        size="lg"
        disabled={!day || !start || submitting}
        onClick={() => void confirm()}
      >
        {submitting && <Loader2 className="animate-spin" />}
        Confirm booking
      </Button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
