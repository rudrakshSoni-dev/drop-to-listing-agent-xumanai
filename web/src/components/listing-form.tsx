"use client";

import { Info, MapPin, Shuffle, Video } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { AvailabilityPicker } from "@/components/availability-picker";
import { ChipInput } from "@/components/chip-input";
import { ConfidenceDot } from "@/components/confidence-dot";
import { MissingFieldsAlert } from "@/components/missing-fields-alert";
import { PricePill } from "@/components/price-pill";
import { RangeSlider } from "@/components/range-slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { api } from "@/lib/api";
import { ageLabel, durationLabel, GROUP_LABELS, MODE_LABELS } from "@/lib/format";
import { FIELD_IDS, type ListingFormValues } from "@/lib/listing-form";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

const MODE_ICONS = { virtual: Video, in_person: MapPin, hybrid: Shuffle } as const;
const DURATIONS = [30, 45, 60, 90, 120, 180, 240];

/** Standard lengths plus whatever the video said (e.g. 210), so the Select never blanks. */
export function durationOptions(current: number): number[] {
  return [...new Set([...DURATIONS, current])].sort((a, b) => a - b);
}

export interface FieldMeta {
  confidence: Record<string, number>;
  isEdited: (key: string) => boolean;
}

function FieldLabel({
  children,
  meta,
  confidenceKey,
  count,
  max,
}: {
  children: ReactNode;
  meta: FieldMeta;
  confidenceKey?: string;
  count?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FormLabel>{children}</FormLabel>
      {confidenceKey && (
        <ConfidenceDot
          score={meta.confidence[confidenceKey]}
          edited={meta.isEdited(confidenceKey)}
        />
      )}
      {max !== undefined && count !== undefined && (
        <span
          className={cn(
            "ml-auto font-mono text-xs tabular-nums",
            count > max ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {count}/{max}
        </span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

/**
 * Keeps the suggested price in step with category, format, mode and length, until
 * the Guide types their own price. Same static table the pipeline uses (pricing.py).
 */
function useSuggestedPrice() {
  const form = useFormContext<ListingFormValues>();
  const [category, group, mode, duration, band] = useWatch({
    control: form.control,
    name: ["category", "format.group", "format.mode", "session.duration_min", "session.price_band"],
  });
  const inputs = `${category}|${group}|${mode}|${duration}`;
  const lastInputs = useRef(inputs);
  const lastSuggested = useRef(band);

  const { getValues, setValue } = form;
  useEffect(() => {
    if (inputs === lastInputs.current) return;
    lastInputs.current = inputs;
    const current = getValues("session.price_band");
    const untouched =
      current.min === lastSuggested.current.min && current.max === lastSuggested.current.max;
    if (!untouched) return;
    const requested = inputs;
    api
      .suggestPrice({ category, group, mode, duration_min: duration })
      .then((next) => {
        // Latest change wins; a slower, older response must not overwrite it.
        if (lastInputs.current !== requested) return;
        lastSuggested.current = next;
        setValue("session.price_band", next, { shouldDirty: true, shouldValidate: true });
      })
      .catch(() => undefined); // keep the old suggestion; it's only a hint
  }, [inputs, category, group, mode, duration, getValues, setValue]);
}

export function ListingForm({ meta, missingFields }: { meta: FieldMeta; missingFields: string[] }) {
  const form = useFormContext<ListingFormValues>();
  const [previewDescription, setPreviewDescription] = useState(false);
  const [title, summary, caption, description, group, duration] = useWatch({
    control: form.control,
    name: ["title", "summary", "caption", "description", "format.group", "session.duration_min"],
  });
  const priceBand = useWatch({ control: form.control, name: "session.price_band" });
  useSuggestedPrice();

  return (
    <div className="space-y-6">
      <MissingFieldsAlert fields={missingFields} />

      <Section title="Basics">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem id={FIELD_IDS.title}>
              <FieldLabel meta={meta} confidenceKey="title" count={title.length} max={60}>
                Title
              </FieldLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="summary"
          render={({ field }) => (
            <FormItem>
              <FieldLabel meta={meta} confidenceKey="summary" count={summary.length} max={280}>
                Summary
              </FieldLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FieldLabel
                meta={meta}
                confidenceKey="description"
                count={description.length}
                max={1200}
              >
                Description
              </FieldLabel>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={previewDescription ? "preview" : "write"}
                onValueChange={(v) => v && setPreviewDescription(v === "preview")}
                className="w-fit"
                aria-label="Description view"
              >
                <ToggleGroupItem value="write" className="px-3 text-xs">
                  Write
                </ToggleGroupItem>
                <ToggleGroupItem value="preview" className="px-3 text-xs">
                  Preview
                </ToggleGroupItem>
              </ToggleGroup>
              {previewDescription ? (
                <div className="bg-muted/40 min-h-36 rounded-lg border p-3">
                  <Markdown source={field.value} />
                </div>
              ) : (
                <FormControl>
                  <Textarea rows={6} {...field} />
                </FormControl>
              )}
              <p className="text-muted-foreground text-xs">
                Markdown: blank lines for paragraphs, “- ” for bullets.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
      </Section>

      <Section title="Classification">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem id={FIELD_IDS.category}>
                <FieldLabel meta={meta} confidenceKey="category">
                  Category
                </FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <SelectItem key={value} value={value}>
                        <Icon /> {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="subcategory"
            render={({ field }) => (
              <FormItem>
                <FieldLabel meta={meta} confidenceKey="subcategory">
                  Subcategory
                </FieldLabel>
                <FormControl>
                  <Input
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    onBlur={field.onBlur}
                    placeholder="e.g. Algebra"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="age_range"
          render={({ field }) => (
            <FormItem id={FIELD_IDS.age_range}>
              <div className="flex items-center gap-1.5">
                <FieldLabel meta={meta} confidenceKey="age_range">
                  Age range
                </FieldLabel>
                <span className="ml-auto font-mono text-sm tabular-nums">
                  {ageLabel(field.value)}
                </span>
              </div>
              <FormControl>
                <RangeSlider
                  min={3}
                  max={18}
                  value={[field.value.min, field.value.max]}
                  onValueChange={([min, max]) => field.onChange({ min, max })}
                  thumbLabels={["Minimum age", "Maximum age"]}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="format.group"
            render={({ field }) => (
              <FormItem id={FIELD_IDS["format.group"]}>
                <FieldLabel meta={meta} confidenceKey="format.group">
                  Format
                </FieldLabel>
                <FormControl>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                    className="w-full"
                  >
                    {(["one_on_one", "small_group"] as const).map((g) => (
                      <ToggleGroupItem key={g} value={g} className="flex-1">
                        {GROUP_LABELS[g]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FormControl>
              </FormItem>
            )}
          />
          {group === "small_group" && (
            <FormField
              control={form.control}
              name="format.max_group_size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max group size</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={2}
                      max={30}
                      inputMode="numeric"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : null)
                      }
                      onBlur={field.onBlur}
                      placeholder="e.g. 6"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="format.mode"
          render={({ field }) => (
            <FormItem id={FIELD_IDS["format.mode"]}>
              <FieldLabel meta={meta} confidenceKey="format.mode">
                Mode
              </FieldLabel>
              <FormControl>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                  className="w-full"
                >
                  {(["virtual", "in_person", "hybrid"] as const).map((m) => {
                    const Icon = MODE_ICONS[m];
                    return (
                      <ToggleGroupItem key={m} value={m} className="flex-1">
                        <Icon /> {MODE_LABELS[m]}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </FormControl>
            </FormItem>
          )}
        />
      </Section>

      <Section title="Session & price">
        <FormField
          control={form.control}
          name="session.duration_min"
          render={({ field }) => (
            <FormItem id={FIELD_IDS["session.duration_min"]}>
              <FieldLabel meta={meta} confidenceKey="session.duration_min">
                Session length
              </FieldLabel>
              <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                <FormControl>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {durationOptions(field.value).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {durationLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Price per session</span>
            <PricePill band={priceBand} durationMin={duration} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground rounded-sm"
                  aria-label="About suggested prices"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Suggested from category + format. Static heuristic, not market data.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-start gap-2">
            {(["min", "max"] as const).map((bound) => (
              <FormField
                key={bound}
                control={form.control}
                name={`session.price_band.${bound}`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="text-muted-foreground text-xs">
                      {bound === "min" ? "Min" : "Max"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={field.value}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? 0 : Number(e.target.value))
                        }
                        onBlur={field.onBlur}
                        className="font-mono tabular-nums"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className="space-y-2">
              <span className="text-muted-foreground block text-xs">Currency</span>
              <span className="bg-muted flex h-9 items-center rounded-lg px-3 font-mono text-sm">
                {priceBand.currency}
              </span>
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="availability"
          render={({ field }) => (
            <FormItem id={FIELD_IDS.availability}>
              <FormLabel>
                Availability{" "}
                <span className="text-muted-foreground font-normal">(required to book)</span>
              </FormLabel>
              <AvailabilityPicker
                value={field.value}
                durationMin={duration}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </Section>

      <Section title="Discovery">
        <FormField
          control={form.control}
          name="skills"
          render={({ field }) => (
            <FormItem>
              <FieldLabel meta={meta} confidenceKey="skills">
                Skills
              </FieldLabel>
              <FormControl>
                <ChipInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Type a skill, press Enter"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FieldLabel meta={meta} confidenceKey="tags">
                Tags
              </FieldLabel>
              <FormControl>
                <ChipInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Type a tag, press Enter"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="caption"
          render={({ field }) => (
            <FormItem>
              <FieldLabel meta={meta} confidenceKey="caption" count={caption.length} max={150}>
                Social caption
              </FieldLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Section>
    </div>
  );
}
