"use client";

import { ArrowUpDown, Check, Minus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORIES } from "@/lib/categories";
import { rowFailed, type EvalRow } from "@/lib/evals";
import { flagInfo } from "@/lib/guardrails";
import type { Listing } from "@/lib/schema";
import { cn } from "@/lib/utils";

type SortKey = "index" | "category" | "age" | "latency";

const label = (c: string) => CATEGORIES[c as Listing["category"]]?.label ?? c;

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return <Minus className="text-muted-foreground size-4" aria-label="not labeled" />;
  return ok ? (
    <Check className="text-success size-4" aria-label="correct" />
  ) : (
    <X className="text-destructive size-4" aria-label="wrong" />
  );
}

/** Flag names, with any in `wrong` (missed or unexpected) marked in red. */
function Flags({ codes, wrong = [] }: { codes: string[]; wrong?: string[] }) {
  if (codes.length === 0) return <span className="text-muted-foreground">none</span>;
  return (
    <>
      {codes.map((c, i) => (
        <span key={c} className={cn(wrong.includes(c) && "text-destructive")}>
          {i > 0 && ", "}
          {flagInfo(c).name}
        </span>
      ))}
    </>
  );
}

export function EvalTable({ rows }: { rows: EvalRow[] }) {
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "index", desc: false });

  const visible = useMemo(() => {
    const indexed = rows.map((row, i) => ({ row, i }));
    const value = ({ row, i }: (typeof indexed)[number]): number | string => {
      const s = row.score;
      switch (sort.key) {
        case "category":
          return label(row.expected.category);
        case "age":
          return s.error ? -1 : (s.age_iou ?? -1);
        case "latency":
          return row.latency_s ?? -1;
        default:
          return i;
      }
    };
    return indexed
      .filter(({ row }) => !onlyFailures || rowFailed(row))
      .sort((a, b) => {
        const [x, y] = [value(a), value(b)];
        const cmp = x < y ? -1 : x > y ? 1 : 0;
        return sort.desc ? -cmp : cmp;
      });
  }, [rows, onlyFailures, sort]);

  const header = (key: SortKey, text: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        className="hover:text-foreground inline-flex items-center gap-1"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }))}
        aria-label={`Sort by ${text}`}
      >
        {text} <ArrowUpDown className="size-3" aria-hidden />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      <label className="flex w-fit items-center gap-2 text-sm">
        <Switch checked={onlyFailures} onCheckedChange={setOnlyFailures} />
        Only failures
      </label>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {header("index", "#", "w-10")}
              <TableHead>Video</TableHead>
              {header("category", "Expected category")}
              <TableHead>Predicted</TableHead>
              {header("age", "Age IoU")}
              <TableHead>Format</TableHead>
              <TableHead>Flags expected / found</TableHead>
              {header("latency", "Latency", "text-right")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ row, i }) => {
              const s = row.score;
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                  <TableCell>
                    <HoverCard openDelay={150}>
                      <HoverCardTrigger asChild>
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex max-w-56 items-center gap-2 hover:underline"
                        >
                          {row.thumbnail && (
                            // eslint-disable-next-line @next/next/no-img-element -- remote 32px thumb
                            <img
                              src={row.thumbnail}
                              alt=""
                              className="h-6 w-8 shrink-0 rounded object-cover"
                              loading="lazy"
                            />
                          )}
                          <span className="truncate text-xs">{row.title ?? row.id}</span>
                        </a>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 text-xs leading-relaxed">
                        {row.transcript_excerpt
                          ? `“${row.transcript_excerpt}…”`
                          : "No transcript recorded."}
                      </HoverCardContent>
                    </HoverCard>
                  </TableCell>
                  <TableCell className="text-xs">{label(row.expected.category)}</TableCell>
                  <TableCell className="text-xs">
                    {s.error ? (
                      <span className="text-destructive font-mono">{row.error ?? "failed"}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Mark ok={s.category_ok} />
                        {!s.category_ok && row.predicted && label(row.predicted.category)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      !s.error && s.age_iou !== null && s.age_iou < 0.5 && "text-destructive",
                    )}
                  >
                    {s.error || s.age_iou === null ? "—" : s.age_iou.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {!s.error && (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Mark ok={s.group_ok} />
                        <span className="text-muted-foreground">/</span>
                        <Mark ok={s.mode_ok} />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 min-w-40 text-xs whitespace-normal">
                    <Flags codes={row.expected.flags} wrong={s.error ? [] : s.flags_missed} />
                    <span className="text-muted-foreground"> / </span>
                    <Flags
                      codes={row.predicted?.flags ?? []}
                      wrong={s.error ? [] : s.flags_extra}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {row.latency_s != null ? `${row.latency_s.toFixed(1)}s` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {visible.length === 0 && (
        <p className="text-muted-foreground text-sm">No failures in this run.</p>
      )}
    </div>
  );
}
