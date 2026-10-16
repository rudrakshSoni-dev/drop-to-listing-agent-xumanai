"use client";

import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WEEKDAYS } from "@/lib/format";
import type { AvailabilitySlot } from "@/lib/schema";

const TIMES = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Weekly slots = every chosen weekday × every chosen start time. */
export function toSlots(days: number[], times: string[], durationMin: number): AvailabilitySlot[] {
  return [...days]
    .sort()
    .flatMap((weekday) =>
      [...times].sort().map((start) => ({ weekday, start, end: addMinutes(start, durationMin) })),
    );
}

export function summarize(slots: AvailabilitySlot[] | null): string | null {
  if (!slots?.length) return null;
  const days = [...new Set(slots.map((s) => s.weekday))].sort().map((d) => WEEKDAYS[d]);
  const times = [...new Set(slots.map((s) => s.start))].sort();
  return `${days.join(", ")} · ${times.length > 2 ? `${times.length} times` : times.join(", ")}`;
}

export function AvailabilityPicker({
  id,
  value,
  durationMin,
  onChange,
}: {
  id?: string;
  value: AvailabilitySlot[] | null;
  durationMin: number;
  onChange: (next: AvailabilitySlot[] | null) => void;
}) {
  const days = [...new Set((value ?? []).map((s) => s.weekday))];
  const times = [...new Set((value ?? []).map((s) => s.start))];
  const update = (d: number[], t: string[]) => {
    const slots = toSlots(d, t, durationMin);
    onChange(slots.length ? slots : null);
  };
  const label = summarize(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-start rounded-lg font-normal"
        >
          <CalendarClock className="text-muted-foreground" />
          {label ?? <span className="text-muted-foreground">Add weekly availability</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-4">
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Days</p>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={days.map(String)}
            onValueChange={(v) => update(v.map(Number), times.length ? times : ["16:00"])}
            className="w-full"
          >
            {WEEKDAYS.map((d, i) => (
              <ToggleGroupItem
                key={d}
                value={String(i)}
                aria-label={d}
                className="flex-1 px-0 text-xs"
              >
                {d.slice(0, 2)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Start times · {durationMin} min each
          </p>
          <ToggleGroup
            type="multiple"
            value={times}
            onValueChange={(t) => update(days, t)}
            className="grid w-full grid-cols-4 gap-1.5"
            disabled={days.length === 0}
          >
            {TIMES.map((t) => (
              <ToggleGroupItem
                key={t}
                value={t}
                className="data-[state=on]:border-primary rounded-md border font-mono text-xs data-[state=on]:bg-primary/10"
              >
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {days.length === 0 && <p className="text-muted-foreground text-xs">Pick days first.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
