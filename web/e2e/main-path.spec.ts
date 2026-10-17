import { expect, test } from "@playwright/test";

import { CLIP } from "./global-setup";

test("upload → live progress → edit → book → confirmed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await page.getByRole("tab", { name: /Upload video/ }).click();
  await page.locator("input[type=file]").setInputFiles(CLIP);
  const generate = page.getByRole("button", { name: /Generate listing/ });
  await expect(generate).toBeEnabled();
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/drops") && r.request().method() === "POST",
  );
  await generate.click();
  const resp = await created;
  expect(resp.status(), `${await resp.text()} | ${errors.join(" | ")}`).toBe(201);

  // Dev mode compiles the route on first visit.
  await expect(page).toHaveURL(/\/drops\//, { timeout: 30_000 });
  await expect(page.getByText("Basics")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Math");

  // Availability is always missing until the Guide sets it.
  await expect(page.getByText(/couldn.t infer/)).toBeVisible();
  await page.getByRole("button", { name: "Add weekly availability" }).click();
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    await page.getByRole("button", { name: day, exact: true }).click();
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Saved").first()).toBeVisible();

  await page.getByRole("button", { name: "Book this session" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "16:00", exact: true }).click();
  await dialog.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(dialog.getByText("You're booked")).toBeVisible();

  expect(errors).toEqual([]);
});
