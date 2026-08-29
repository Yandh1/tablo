import { expect, test } from "@playwright/test";

test("serves the home page from a production build", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
