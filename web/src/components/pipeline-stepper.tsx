"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import type { DropEventsState, StageState } from "@/hooks/use-drop-events";
import { STAGES } from "@/lib/stages";
import { cn } from "@/lib/utils";

function elapsedMs(stage: StageState, now: number): number | null {
  if (stage.startT === undefined) return null;
  if (stage.endT !== undefined) return Math.max(0, stage.endT - stage.startT);
  if (stage.status === "active" && stage.receivedAt !== undefined)
    return Math.max(0, now - stage.receivedAt);
  return null;
}

function StatusIcon({ status }: { status: StageState["status"] }) {
  const cls = "size-6 shrink-0";
  switch (status) {
    case "active":
      return <Loader2 className={cn(cls, "text-primary animate-spin")} aria-hidden />;
    case "done":
      return <CheckCircle2 className={cn(cls, "text-success")} aria-hidden />;
    case "error":
      return <XCircle className={cn(cls, "text-destructive")} aria-hidden />;
    default:
      return <Circle className={cn(cls, "text-muted-foreground")} aria-hidden />;
  }
}

const STATUS_TEXT: Record<StageState["status"], string> = {
  pending: "pending",
  active: "in progress",
  done: "done",
  error: "failed",
};

export function PipelineStepper({ state }: { state: DropEventsState }) {
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const running = state.status === "running" || state.status === "connecting";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  const completed = STAGES.filter(({ key }) => state.stages[key].status === "done").length;
  const active = STAGES.find(({ key }) => state.stages[key].status === "active");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Building your listing</h2>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {completed}/{STAGES.length}
          </span>
        </div>
        <Progress
          value={(completed / STAGES.length) * 100}
          aria-label="Overall progress"
          className="bg-muted"
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {active ? `${active.label}…` : state.status === "done" ? "Listing ready" : ""}
      </p>

      <ol className="space-y-4">
        {STAGES.map(({ key, label }) => {
          const stage = state.stages[key];
          const ms = key === "done" ? null : elapsedMs(stage, now);
          return (
            <li key={key} className="flex gap-3">
              <StatusIcon status={stage.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm",
                      stage.status === "pending"
                        ? "text-muted-foreground"
                        : "text-foreground font-medium",
                    )}
                  >
                    {label}
                    <span className="sr-only">, {STATUS_TEXT[stage.status]}</span>
                  </span>
                  {ms !== null && (
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {(ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {stage.status === "active" && stage.detail && (
                    <motion.p
                      key={stage.detail}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-muted-foreground mt-1 truncate text-xs"
                    >
                      {stage.detail}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
