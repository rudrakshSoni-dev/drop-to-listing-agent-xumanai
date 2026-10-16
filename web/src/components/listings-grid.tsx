"use client";

import { Clapperboard, Film, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PricePill } from "@/components/price-pill";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useListings } from "@/hooks/use-listing";
import { ApiError, type ListingSummary } from "@/lib/api";
import { CATEGORIES, CATEGORY_OPTIONS } from "@/lib/categories";
import {
  ageLabel,
  GROUP_LABELS,
  MODE_LABELS,
  STATUS_LABELS,
  type GuardrailStatus,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<GuardrailStatus, string> = {
  pass: "bg-success",
  warn: "bg-warning",
  block: "bg-destructive",
};

type StatusFilter = "all" | GuardrailStatus;

export function filterListings(
  items: ListingSummary[],
  { query, category, status }: { query: string; category: string; status: StatusFilter },
) {
  const q = query.trim().toLowerCase();
  return items.filter(
    (l) =>
      (!q || `${l.title} ${l.summary} ${l.tags.join(" ")}`.toLowerCase().includes(q)) &&
      (category === "all" || l.category === category) &&
      (status === "all" || l.guardrails.status === status),
  );
}

function ListingCard({ listing }: { listing: ListingSummary }) {
  const status = listing.guardrails.status;
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2"
    >
      <Card className="group-hover:border-muted-foreground/40 h-full gap-0 overflow-hidden p-0 transition-colors duration-150">
        <div className="bg-muted relative flex aspect-[4/5] items-center justify-center">
          <Film className="text-muted-foreground size-8" aria-hidden />
          <SourceBadge type={listing.source.type} className="absolute top-3 left-3" />
          <span className="bg-background/80 absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs backdrop-blur">
            <span className={cn("size-2 rounded-full", STATUS_DOT[status])} aria-hidden />
            {STATUS_LABELS[status]}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <h2 className="line-clamp-2 font-semibold">{listing.title}</h2>
          <p className="text-muted-foreground text-xs">
            {CATEGORIES[listing.category].label} · {ageLabel(listing.age_range)} ·{" "}
            {GROUP_LABELS[listing.format.group]} · {MODE_LABELS[listing.format.mode]}
          </p>
          <PricePill band={listing.session.price_band} durationMin={listing.session.duration_min} />
        </div>
      </Card>
    </Link>
  );
}

export function ListingsGrid() {
  const listings = useListings();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  let content;
  if (listings.isPending) {
    content = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="gap-0 overflow-hidden p-0">
            <Skeleton className="aspect-[4/5] rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-1/3 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    );
  } else if (listings.error) {
    content = (
      <ErrorState
        code={listings.error instanceof ApiError ? listings.error.code : null}
        onRetry={() => void listings.refetch()}
      />
    );
  } else if (listings.data.length === 0) {
    content = (
      <EmptyState
        icon={Clapperboard}
        message="No listings yet. Turn your first video into one."
        action={
          <Button asChild>
            <Link href="/">Create</Link>
          </Button>
        }
      />
    );
  } else {
    const visible = filterListings(listings.data, { query, category, status });
    content =
      visible.length === 0 ? (
        <EmptyState icon={Search} message="No listings match these filters." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      );
  }

  return (
    <div className="space-y-6 pt-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Listings</h1>
        <Button asChild>
          <Link href="/">
            <Plus /> New listing
          </Link>
        </Button>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:max-w-xs md:flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search listings"
            aria-label="Search listings"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full md:w-60" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          variant="outline"
          value={status}
          onValueChange={(v) => v && setStatus(v as StatusFilter)}
          aria-label="Status"
          className="w-full md:w-auto"
        >
          <ToggleGroupItem value="all" className="flex-1 px-3 md:flex-none">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="pass" className="flex-1 px-3 md:flex-none">
            Ready
          </ToggleGroupItem>
          <ToggleGroupItem value="warn" className="flex-1 px-3 md:flex-none">
            Needs review
          </ToggleGroupItem>
          <ToggleGroupItem value="block" className="flex-1 px-3 md:flex-none">
            Blocked
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {content}
    </div>
  );
}
