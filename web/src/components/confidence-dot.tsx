import { Pencil } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function confidenceTone(score: number): "success" | "warning" | "destructive" {
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "warning";
  return "destructive";
}

const TONE_CLASS = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
} as const;

/** 8px dot showing AI confidence; becomes a pencil once the Guide edits the field. */
export function ConfidenceDot({ score, edited = false }: { score?: number; edited?: boolean }) {
  if (edited) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="text-muted-foreground inline-flex rounded-sm">
            <Pencil className="size-3" aria-hidden />
            <span className="sr-only">Edited by you</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Edited by you</TooltipContent>
      </Tooltip>
    );
  }
  if (score === undefined) return null;
  const pct = Math.round(score * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex size-4 items-center justify-center rounded-full">
          <span
            className={cn("size-2 rounded-full", TONE_CLASS[confidenceTone(score)])}
            aria-hidden
          />
          <span className="sr-only">AI confidence {pct}%</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>AI confidence {pct}%</TooltipContent>
    </Tooltip>
  );
}
