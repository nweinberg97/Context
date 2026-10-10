import { expect, type Page } from "@playwright/test";

export const ADVICE = `Hi Jordan,

Great work today. Do the chin tucks, 2 x 10, every morning. Try the doorway stretch before bed.
Keep working on your breathing exercises.

See you on the 24th,
Marina`;

export function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export async function signUp(page: Page, email: string, password = "correct horse battery") {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function completeOnboarding(page: Page) {
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Reminders are opt-in: the box starts unchecked.
  await expect(page.getByRole("checkbox", { name: /daily check-in/i })).not.toBeChecked();
  await page.getByRole("button", { name: "Add my first advice" }).click();
  await expect(page).toHaveURL(/\/import\?first=1/);
}

export async function importAdvice(page: Page, text = ADVICE, title = "Physio — week 3") {
  await page.goto("/import");
  await page.getByLabel("Message").fill(text);
  await page.getByLabel("Title (optional)").fill(title);
  await page.getByRole("button", { name: "Find the habits" }).click();
  await expect(page).toHaveURL(/\/review\//);
}

export async function newUserWithRoutine(page: Page, label: string) {
  const email = uniqueEmail(label);
  await signUp(page, email);
  await completeOnboarding(page);
  await importAdvice(page);
  await page.getByRole("article", { name: "Chin tucks" }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("article", { name: "Chin tucks" }).getByText("Approved")).toBeVisible();
  await page.getByRole("button", { name: /Save routine/ }).click();
  await expect(page).toHaveURL(/\/today\?saved=/);
  return email;
}
