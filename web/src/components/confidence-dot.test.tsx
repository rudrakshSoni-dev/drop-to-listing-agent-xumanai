import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { ConfidenceDot, confidenceTone } from "./confidence-dot";

const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("ConfidenceDot", () => {
  it("maps scores to DESIGN.md thresholds", () => {
    expect(confidenceTone(0.8)).toBe("success");
    expect(confidenceTone(0.79)).toBe("warning");
    expect(confidenceTone(0.5)).toBe("warning");
    expect(confidenceTone(0.49)).toBe("destructive");
  });

  it("announces confidence as text, not just color", () => {
    wrap(<ConfidenceDot score={0.724} />);
    expect(screen.getByText("AI confidence 72%")).toBeInTheDocument();
  });

  it("switches to an edited marker once the Guide edits the field", () => {
    wrap(<ConfidenceDot score={0.9} edited />);
    expect(screen.getByText("Edited by you")).toBeInTheDocument();
    expect(screen.queryByText(/AI confidence/)).not.toBeInTheDocument();
  });
});
