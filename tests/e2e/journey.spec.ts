import { expect, test } from "@playwright/test";
import { ADVICE, alertBox, completeOnboarding, importAdvice, newUserWithRoutine, signUp, uniqueEmail } from "./helpers";

test("landing page explains the product and links to sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Don.t let good advice get lost in your inbox/ })).toBeVisible();
  await page.getByRole("link", { name: "Build your first routine" }).first().click();
  await expect(page).toHaveURL(/\/sign-up/);
});

test("app routes require a session", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("core journey: import, review, approve, follow, correct", async ({ page }) => {
  await signUp(page, uniqueEmail("journey"));
  await expect(page.getByText("Local development mode")).toBeVisible();
  await completeOnboarding(page);

  await importAdvice(page);
  await expect(page.getByRole("heading", { name: "Here's what we found." })).toBeVisible();

  const chin = page.getByRole("article", { name: "Chin tucks" });
  await expect(chin.getByText("2 x 10", { exact: true })).toBeVisible();
  await expect(chin.getByText("Waiting for you")).toBeVisible();

  // Ambiguous instructions are flagged, not guessed.
  const breathing = page.getByRole("article", { name: /breathing exercises/i });
  await expect(breathing.getByText("Worth checking before you approve")).toBeVisible();
  await expect(breathing.getByText("Not stated").first()).toBeVisible();

  // Nothing can be saved before something is approved.
  await expect(page.getByRole("button", { name: /Save routine/ })).toBeDisabled();

  await chin.getByRole("button", { name: "Approve" }).click();
  await expect(chin.getByText("Approved")).toBeVisible();
  await breathing.getByRole("button", { name: "Not a habit" }).click();
  await expect(breathing.getByText("Left out")).toBeVisible();

  // Edit the doorway stretch to fill in a missing detail, then approve it.
  const doorway = page.getByRole("article", { name: /doorway stretch/i });
  await doorway.getByRole("button", { name: "Edit" }).click();
  await doorway.getByLabel("How much").fill("30 seconds");
  await doorway.getByRole("button", { name: "Save changes" }).click();
  await expect(doorway.getByText("(your words)")).toBeVisible();
  await doorway.getByRole("button", { name: "Approve" }).click();

  await page.getByLabel("Routine name").fill("Neck & shoulders");
  await page.getByRole("button", { name: /Save routine · 2 habits/ }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText("Routine saved.")).toBeVisible();

  // The one-pager shows only approved habits, grouped by timing cue.
  await expect(page.getByRole("heading", { name: "Every morning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before bed" })).toBeVisible();
  await expect(page.getByText("breathing exercises")).toHaveCount(0);
  await expect(page.getByText("0 of 2 checked in")).toBeVisible();

  const done = page.getByRole("group", { name: /Chin tucks/ }).getByRole("button", { name: "Done" });
  await done.click();
  await expect(done).toHaveAttribute("aria-pressed", "true");

  // Persists across reloads.
  await page.reload();
  await expect(page.getByRole("group", { name: /Chin tucks/ }).getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 of 2 checked in")).toBeVisible();

  // Correcting: pressing Done again clears it back to unreported.
  await page.getByRole("group", { name: /Chin tucks/ }).getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.getByRole("group", { name: /Chin tucks/ }).getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("0 of 2 checked in")).toBeVisible();
});

test("importing the same message twice points to the existing routine", async ({ page }) => {
  await signUp(page, uniqueEmail("dupe"));
  await completeOnboarding(page);
  await importAdvice(page);
  await page.goto("/import");
  await page.getByLabel("Message").fill(ADVICE);
  await page.getByRole("button", { name: "Find the habits" }).click();
  await expect(page.getByText("You've already added this message.")).toBeVisible();
});

test("empty and oversized input show clear errors and keep the text", async ({ page }) => {
  await signUp(page, uniqueEmail("errors"));
  await completeOnboarding(page);
  await page.goto("/import");
  await page.getByLabel("Message").fill("\n\nSent from my iPhone\n");
  await page.getByRole("button", { name: "Find the habits" }).click();
  await expect(alertBox(page)).toContainText("no message text");
  await expect(page.getByLabel("Message")).toHaveValue("\n\nSent from my iPhone\n");

  await page.getByLabel("Message").fill("a".repeat(12_050));
  await expect(page.getByText(/characters over the limit/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Find the habits" })).toBeDisabled();
});

test("accounts are isolated: another person's routine is not reachable by URL", async ({ page, browser }) => {
  await newUserWithRoutine(page, "owner");
  await page.goto("/routines");
  await page.getByRole("link", { name: /Physio/ }).first().click();
  await expect(page).toHaveURL(/\/routines\/[0-9a-f-]{36}$/);
  const routineUrl = page.url();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUp(otherPage, uniqueEmail("intruder"));
  // Pages stream behind a loading state, so the status code can't be relied on; the content can.
  await otherPage.goto(routineUrl);
  await expect(otherPage.getByRole("heading", { name: "Nothing here." })).toBeVisible();
  await expect(otherPage.getByText("Physio")).toHaveCount(0);
  await otherPage.goto("/today");
  await expect(otherPage).toHaveURL(/onboarding/);
  await other.close();
});

test("settings: reminders opt-in, export, and account deletion", async ({ page, request }) => {
  const email = await newUserWithRoutine(page, "settings");
  await page.goto("/settings");
  await expect(page.getByText(email)).toBeVisible();

  const reminder = page.getByRole("checkbox", { name: "Email me a check-in" });
  await expect(reminder).not.toBeChecked();
  await reminder.check();
  await page.getByRole("button", { name: "Save check-in settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "Pause for a week" }).click();
  await expect(page.getByText("Paused through")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export my data" }).click();
  const file = await download;
  const exported = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(exported.format).toBe("context-export");
  expect(exported.habits.some((h: { name: string }) => h.name === "Chin tucks")).toBe(true);
  expect(exported.consentEvents.map((c: { kind: string }) => c.kind)).toContain("reminders_opt_in");

  // Export requires a session.
  const anonymous = await request.get("/api/export", { headers: { cookie: "" } });
  expect(anonymous.status()).toBe(401);

  await page.getByLabel(/Type delete to confirm/).fill("delete");
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1/);
  await expect(page.getByText("Your account and data have been deleted.")).toBeVisible();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(alertBox(page)).toContainText("don't match");
});

test("signing out revokes the session", async ({ page }) => {
  await signUp(page, uniqueEmail("signout"));
  await completeOnboarding(page);
  const cookies = await page.context().cookies();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  // Re-using the old cookie no longer works.
  await page.context().addCookies(cookies);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("keyboard: skip link and form controls are reachable", async ({ page }) => {
  await page.goto("/sign-in");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
});
