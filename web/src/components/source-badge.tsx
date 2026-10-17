import { Camera, Music2, TvMinimalPlay, Upload, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SourceType } from "@/lib/sources";
import { cn } from "@/lib/utils";

export const SOURCES: Record<SourceType, { label: string; icon: LucideIcon }> = {
  instagram: { label: "Instagram", icon: Camera },
  tiktok: { label: "TikTok", icon: Music2 },
  youtube: { label: "YouTube", icon: TvMinimalPlay },
  upload: { label: "Upload", icon: Upload },
};

export function SourceBadge({ type, className }: { type: SourceType; className?: string }) {
  const { label, icon: Icon } = SOURCES[type];
  return (
    <Badge variant="secondary" className={cn("gap-1 rounded-full", className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  );
}
