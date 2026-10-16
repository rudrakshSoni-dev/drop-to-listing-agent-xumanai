"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChartColumn } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { EvalCharts } from "@/components/eval-charts";
import { EvalTable } from "@/components/eval-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { pct } from "@/lib/evals";
import { Markdown } from "@/lib/markdown";

function MetricCard({
  label,
  value,
  sub,
  small = false,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  small?: boolean;
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className={small ? "text-xl font-semibold" : "text-3xl font-semibold tabular-nums"}>
        {value}
      </p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </Card>
  );
}

export function EvalsView() {
  const query = useQuery({ queryKey: ["evals"], queryFn: api.getEvals, retry: false });

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (query.error) {
    if (query.error instanceof ApiError && query.error.code === "EVALS_NOT_RUN") {
      return <EmptyState icon={ChartColumn} message="No eval run yet. Run `make evals`." />;
    }
    return (
      <ErrorState
        code={query.error instanceof ApiError ? query.error.code : "NETWORK"}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { results, notes_md } = query.data;
  const { meta, metrics: m } = results;
  const all = m.guardrails.ALL;

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground -mt-6 text-sm">
        {m.n} labeled public videos · run {formatDistanceToNow(new Date(meta.run_at))} ago · model{" "}
        {meta.models.join(", ") || "n/a"} · prompt <span className="font-mono">{meta.prompt}</span>
        {m.n_failed > 0 && ` · ${m.n_failed} failed to process (counted below)`}
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Category"
          value={pct(m.category_accuracy)}
          sub={`exact match · ${m.n_scored} videos`}
        />
        <MetricCard
          label="Age range"
          value={pct(m.age.accuracy_iou_50)}
          sub={`IoU ≥ 0.5 · mean IoU ${m.age.mean_iou?.toFixed(2) ?? "—"} · ${m.age.n} labeled`}
        />
        <MetricCard
          label="Format"
          value={`${pct(m.format.group_accuracy)} / ${pct(m.format.mode_accuracy)}`}
          sub={`group (${m.format.group_n}) / mode (${m.format.mode_n}) where stated`}
        />
        <MetricCard
          label="Guardrail recall"
          value={pct(all.recall)}
          sub={`precision ${pct(all.precision)} · ${all.support} expected flags`}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          small
          label="Latency p50"
          value={m.latency_s.p50 != null ? `${m.latency_s.p50.toFixed(1)}s` : "—"}
          sub={meta.latency_note}
        />
        <MetricCard
          small
          label="Latency p95"
          value={m.latency_s.p95 != null ? `${m.latency_s.p95.toFixed(1)}s` : "—"}
          sub={`${m.latency_s.n} uncached runs`}
        />
        <MetricCard
          small
          label="Tokens per listing"
          value={
            m.tokens_per_listing != null ? Math.round(m.tokens_per_listing).toLocaleString() : "—"
          }
          sub="input + output, one model call"
        />
        <MetricCard
          small
          label="Transcription"
          value={meta.transcribe_backend === "whisper" ? "Local" : "Gemini"}
          sub={
            meta.transcribe_backend === "whisper"
              ? `faster-whisper ${meta.whisper_model}`
              : undefined
          }
        />
      </div>

      <EvalCharts metrics={m} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Per video</h2>
        <EvalTable rows={results.rows} />
      </section>

      {notes_md && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What fails and why</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown source={notes_md} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
