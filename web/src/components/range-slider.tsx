"use client";

import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** Dual-thumb slider with a label per thumb (shadcn's Slider can't label thumbs). */
export function RangeSlider({
  id,
  value,
  min,
  max,
  onValueChange,
  thumbLabels,
  className,
}: {
  id?: string;
  value: [number, number];
  min: number;
  max: number;
  onValueChange: (value: [number, number]) => void;
  thumbLabels: [string, string];
  className?: string;
}) {
  return (
    <SliderPrimitive.Root
      id={id}
      value={value}
      min={min}
      max={max}
      step={1}
      minStepsBetweenThumbs={0}
      onValueChange={(v) => onValueChange([v[0], v[1]])}
      className={cn("relative flex w-full touch-none items-center py-2 select-none", className)}
    >
      <SliderPrimitive.Track className="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full">
        <SliderPrimitive.Range className="bg-primary absolute h-full" />
      </SliderPrimitive.Track>
      {thumbLabels.map((label) => (
        <SliderPrimitive.Thumb
          key={label}
          aria-label={label}
          className="border-primary bg-background focus-visible:ring-ring/50 block size-5 rounded-full border-2 shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-4"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
