import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Evaluation" };

export default function EvalsPage() {
  return (
    <div className="space-y-8 pt-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Evaluation</h1>
      <EmptyState
        icon={ChartColumn}
        message="No eval run yet. Results from the hand-labeled video set will appear here once the runner has been run."
      />
    </div>
  );
}
