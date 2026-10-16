import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { BookDialog } from "@/components/book-dialog";
import { api } from "@/lib/api";
import type { ListingFormValues } from "@/lib/listing-form";

beforeAll(() => {
  // jsdom has no matchMedia; report a desktop viewport so the Dialog variant renders.
  window.matchMedia ??= ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => vi.restoreAllMocks());

const values = (availability: ListingFormValues["availability"]): ListingFormValues => ({
  title: "Fractions without fear",
  summary: "1:1 online math help.",
  description: "",
  category: "academic_tutoring",
  subcategory: null,
  age_range: { min: 11, max: 14 },
  format: { group: "one_on_one", mode: "virtual", max_group_size: null },
  session: { duration_min: 60, price_band: { min: 30, max: 55, currency: "USD" } },
  skills: [],
  tags: [],
  caption: "",
  thumbnail_frame: null,
  availability,
});

const everyDayAt4 = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  start: "16:00",
  end: "17:00",
}));

describe("BookDialog", () => {
  it("books the first available day after picking a time", async () => {
    const book = vi.spyOn(api, "book").mockResolvedValue({
      confirmation_id: "bk_test",
      listing_id: "l1",
      starts_at: "2026-10-20T16:00",
      ends_at: "2026-10-20T17:00",
    });
    const beforeBook = vi.fn().mockResolvedValue(true);
    render(
      <BookDialog
        open
        onOpenChange={() => undefined}
        listingId="l1"
        values={values(everyDayAt4)}
        onBeforeBook={beforeBook}
      />,
    );
    const confirm = screen.getByRole("button", { name: /Confirm booking/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "16:00" }));
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByText("You're booked")).toBeTruthy());
    expect(beforeBook).toHaveBeenCalled();
    expect(book).toHaveBeenCalledWith("l1", expect.objectContaining({ start: "16:00" }));
    expect(screen.getByText("bk_test")).toBeTruthy();
  });

  it("explains missing availability instead of showing a calendar", () => {
    const setAvailability = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <BookDialog
        open
        onOpenChange={onOpenChange}
        listingId="l1"
        values={values(null)}
        onSetAvailability={setAvailability}
      />,
    );
    expect(screen.getByText(/hasn't set availability yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set availability" }));
    // The dialog closes first; focus moves to the field once it has (onCloseAutoFocus).
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
