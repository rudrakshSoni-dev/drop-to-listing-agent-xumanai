"use client";

import { PlayCircle, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { timestamp } from "@/lib/format";
import { flagInfo, SEVERITY_LABELS, STATUS_COPY } from "@/lib/guardrails";
import type { GuardrailFlag, Listing } from "@/lib/schema";
import { cn } from "@/lib/utils";

const STATUS_ICON = {
  pass: { icon: ShieldCheck, tone: "text-success" },
  warn: { icon: ShieldAlert, tone: "text-warning" },
  block: { icon: ShieldX, tone: "text-destructive" },
} as const;

const SEVERITY_TONE: Record<GuardrailFlag["severity"], string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  med: "border-warning/40 bg-warning/10 text-warning",
  low: "border-border bg-muted text-muted-foreground",
};

export function SafetyPanel({
  guardrails,
  onSeek,
}: {
  guardrails: Listing["guardrails"];
  onSeek?: (seconds: number) => void;
}) {
  const { icon: Icon, tone } = STATUS_ICON[guardrails.status];
  const copy = STATUS_COPY[guardrails.status];

  return (
    <Card className="gap-4 p-4 md:p-6">
      <div className="flex items-start gap-3" role="status">
        <Icon className={cn("mt-0.5 size-7 shrink-0", tone)} aria-hidden />
        <div>
          <p className="font-semibold">{copy.title}</p>
          <p className="text-muted-foreground text-sm">{copy.line}</p>
        </div>
      </div>

      {guardrails.flags.length > 0 && (
        <Accordion
          type="multiple"
          defaultValue={guardrails.flags.map((f) => f.code)}
          className="border-t"
        >
          {guardrails.flags.map((flag) => {
            const info = flagInfo(flag.code);
            const at = flag.timestamp_s;
            return (
              <AccordionItem key={flag.code} value={flag.code}>
                <AccordionTrigger className="gap-2 hover:no-underline">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("rounded-full", SEVERITY_TONE[flag.severity])}
                    >
                      {SEVERITY_LABELS[flag.severity]}
                    </Badge>
                    <span className="font-medium">{info.name}</span>
                    {at != null && (
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {timestamp(at)}
                      </span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-sm">{flag.explanation}</p>
                  <blockquote className="bg-muted rounded-md border-l-2 border-l-primary px-3 py-2 font-mono text-xs break-words">
                    “{flag.evidence}”
                  </blockquote>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {at != null ? (
                      onSeek && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto gap-1 p-0 text-xs"
                          onClick={() => onSeek(at)}
                        >
                          <PlayCircle className="size-3.5" aria-hidden /> Jump to {timestamp(at)}
                        </Button>
                      )
                    ) : (
                      <span className="text-muted-foreground">
                        From the caption or listing text
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    <span className="text-foreground font-medium">Suggested fix: </span>
                    {info.fix}
                  </p>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <p className="text-muted-foreground border-t pt-3 text-xs">
        Automated checks flag content for review. They don&apos;t certify safety.
      </p>
    </Card>
  );
}
