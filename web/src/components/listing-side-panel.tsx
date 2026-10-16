"use client";

import { Film, MapPin, ShieldCheck, Shuffle, Video } from "lucide-react";
import { useWatch } from "react-hook-form";

import { PricePill } from "@/components/price-pill";
import { SourceBadge } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIES } from "@/lib/categories";
import { ageLabel, GROUP_LABELS, MODE_LABELS } from "@/lib/format";
import type { ListingFormValues } from "@/lib/listing-form";
import type { Listing } from "@/lib/schema";

const MODE_ICONS = { virtual: Video, in_person: MapPin, hybrid: Shuffle } as const;

/** Live listing card. The phone-frame swipe preview replaces this in build step 6. */
function PreviewCard({ listing }: { listing: Listing }) {
  const values = useWatch<ListingFormValues>() as ListingFormValues;
  const ModeIcon = MODE_ICONS[values.format.mode];
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="bg-muted relative flex aspect-[4/5] items-center justify-center">
        <Film className="text-muted-foreground size-8" aria-hidden />
        <SourceBadge type={listing.source.type} className="absolute top-3 left-3" />
      </div>
      <div className="space-y-3 p-4">
        <h3 className="line-clamp-2 text-lg font-semibold">{values.title || "Untitled listing"}</h3>
        <p className="text-muted-foreground line-clamp-2 text-sm">{values.summary}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="rounded-full">
            {CATEGORIES[values.category].label}
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {ageLabel(values.age_range)}
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {GROUP_LABELS[values.format.group]}
          </Badge>
          <Badge variant="secondary" className="gap-1 rounded-full">
            <ModeIcon className="size-3" aria-hidden /> {MODE_LABELS[values.format.mode]}
          </Badge>
        </div>
        <PricePill band={values.session.price_band} durationMin={values.session.duration_min} />
      </div>
    </Card>
  );
}

/** Interim safety summary until guardrails land in build step 5. */
function SafetySummary({ listing }: { listing: Listing }) {
  return (
    <Card className="gap-3 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-muted-foreground size-6" aria-hidden />
        <div>
          <p className="font-medium">No flags yet</p>
          <p className="text-muted-foreground text-sm">
            {listing.guardrails.flags.length === 0
              ? "Youth-safety checks aren't enabled in this build."
              : `${listing.guardrails.flags.length} flagged for review.`}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground border-t pt-3 text-xs">
        Automated checks flag content for review. They don&apos;t certify safety.
      </p>
    </Card>
  );
}

export function ListingSidePanel({ listing }: { listing: Listing }) {
  return (
    <Tabs defaultValue="preview">
      <TabsList className="w-full">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="safety">Safety ({listing.guardrails.flags.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="preview" className="mt-4">
        <PreviewCard listing={listing} />
      </TabsContent>
      <TabsContent value="safety" className="mt-4">
        <SafetySummary listing={listing} />
      </TabsContent>
    </Tabs>
  );
}

export { PreviewCard, SafetySummary };
