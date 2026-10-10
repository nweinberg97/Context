import { expect, test } from "@playwright/test";
import { newUserWithRoutine } from "./helpers";

async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("mobile: key screens fit the viewport and the bottom nav works", async ({ page }) => {
  await page.goto("/");
  await noHorizontalOverflow(page);

  await newUserWithRoutine(page, "mobile");
  for (const path of ["/today", "/routines", "/import", "/settings"]) {
    await page.goto(path);
    await noHorizontalOverflow(page);
  }
  await page.goto("/today");
  await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Routines" }).click();
  await expect(page).toHaveURL(/\/routines/);
});
