"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CATEGORIES } from "@/lib/categories";
import type { EvalResults } from "@/lib/evals";
import { flagInfo } from "@/lib/guardrails";
import type { Listing } from "@/lib/schema";

const accuracyConfig = {
  accuracy: { label: "Accuracy", color: "var(--color-primary)" },
} satisfies ChartConfig;

const flagConfig = {
  precision: { label: "Precision", color: "var(--color-primary)" },
  recall: { label: "Recall", color: "var(--color-info)" },
} satisfies ChartConfig;

const asPct = (v: number) => `${Math.round(v * 100)}%`;

// Axis-sized names; the full names are in the table and Safety panel.
const SHORT_FLAG: Record<string, string> = {
  OFF_PLATFORM_CONTACT: "Contact",
  PRIVATE_MEETING_MINOR: "Private 1:1",
  UNVERIFIED_CREDENTIAL: "Credential",
  AGE_MISMATCH: "Age fit",
  GUARANTEED_OUTCOME: "Guarantee",
  UNSAFE_ACTIVITY: "Safety info",
};

export function EvalCharts({ metrics }: { metrics: EvalResults["metrics"] }) {
  const categories = Object.entries(metrics.per_category)
    .map(([key, v]) => ({
      name: CATEGORIES[key as Listing["category"]]?.label ?? key,
      accuracy: v.accuracy,
      n: v.n,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Only codes the dataset actually tests (or the pipeline actually raised).
  const flags = Object.entries(metrics.guardrails)
    .filter(([code, m]) => code !== "ALL" && (m.support > 0 || m.predicted > 0))
    .map(([code, m]) => ({
      name: SHORT_FLAG[code] ?? flagInfo(code).name,
      precision: m.precision ?? 0,
      recall: m.recall ?? 0,
    }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Category accuracy by category</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={accuracyConfig}
            className="aspect-auto w-full"
            style={{ height: Math.max(160, categories.length * 34) }}
          >
            <BarChart data={categories} layout="vertical" margin={{ left: 4, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" domain={[0, 1]} tickFormatter={asPct} />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) =>
                      `${asPct(Number(value))} of ${(item.payload as { n: number }).n}`
                    }
                  />
                }
              />
              <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Guardrails: precision and recall</CardTitle>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <p className="text-muted-foreground text-sm">No flags were expected or raised.</p>
          ) : (
            <ChartContainer config={flagConfig} className="aspect-auto h-[260px] w-full">
              <BarChart data={flags} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 11 }} interval={0} />
                <YAxis domain={[0, 1]} tickFormatter={asPct} width={40} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(v, name) => `${name}: ${asPct(Number(v))}`} />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="precision" fill="var(--color-precision)" radius={4} />
                <Bar dataKey="recall" fill="var(--color-recall)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
