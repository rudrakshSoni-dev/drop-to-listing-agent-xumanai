import type { Metadata } from "next";

import { EvalsView } from "@/components/evals-view";

export const metadata: Metadata = { title: "Evaluation" };

export default function EvalsPage() {
  return (
    <div className="space-y-8 pt-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Evaluation</h1>
      <EvalsView />
    </div>
  );
}
