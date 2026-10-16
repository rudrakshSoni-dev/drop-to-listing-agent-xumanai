import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SafetyPanel } from "@/components/safety-panel";

describe("SafetyPanel", () => {
  it("explains each flag and jumps the video to its evidence", () => {
    const onSeek = vi.fn();
    render(
      <SafetyPanel
        onSeek={onSeek}
        guardrails={{
          status: "block",
          flags: [
            {
              code: "OFF_PLATFORM_CONTACT",
              severity: "high",
              evidence: "you can go to my website or just call me",
              explanation: "Asks families to make contact outside the platform.",
              timestamp_s: 32,
            },
            {
              code: "GUARANTEED_OUTCOME",
              severity: "low",
              evidence: "Guaranteed A+",
              explanation: "Promises a guaranteed result.",
              timestamp_s: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Not publishable yet")).toBeTruthy();
    expect(screen.getByText("Off-platform contact")).toBeTruthy();
    expect(screen.getByText(/my website or just call me/)).toBeTruthy();
    expect(screen.getByText("From the caption or listing text")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Jump to 0:32/ }));
    expect(onSeek).toHaveBeenCalledWith(32);
  });

  it("never claims a listing is safe", () => {
    render(<SafetyPanel guardrails={{ status: "pass", flags: [] }} />);
    expect(screen.queryByText(/\bsafe\b/i)).toBeNull();
    expect(screen.getByText(/don.t certify safety/)).toBeTruthy();
  });
});
