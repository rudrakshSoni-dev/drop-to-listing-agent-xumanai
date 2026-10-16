import { Badge } from "@/components/ui/badge";
import { priceLabel } from "@/lib/format";
import type { Listing } from "@/lib/schema";
import { cn } from "@/lib/utils";

export function PricePill({
  band,
  durationMin,
  className,
}: {
  band: Listing["session"]["price_band"];
  durationMin: number;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-normal tabular-nums", className)}>
      <span className="text-muted-foreground">Suggested</span>
      <span className="font-medium">{priceLabel(band)}</span>
      <span className="text-muted-foreground">/ {durationMin} min</span>
    </Badge>
  );
}
