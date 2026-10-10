import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { newUserWithRoutine } from "./helpers";

const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/context_e2e";
const sql = (q: string) => execSync(`psql "${DB}" -At -c "${q.replaceAll('"', '\\"')}"`).toString().trim();
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789" };

test("cron endpoint requires the shared secret", async ({ request }) => {
  expect((await request.post("/api/cron/dispatch")).status()).toBe(401);
  expect((await request.post("/api/cron/dispatch", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("unsubscribe link: GET changes nothing, the button does", async ({ page, request }) => {
  const email = await newUserWithRoutine(page, "unsub");
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: "Email me a check-in" }).check();
  await page.getByRole("button", { name: "Save check-in settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  const key = sql(`select np.unsubscribe_key from public.notification_preferences np join public.profiles p on p.id = np.user_id where p.email = '${email}'`);
  // Simulate an email security scanner following the link.
  const scanned = await request.get(`/unsubscribe/${key}`);
  expect(scanned.status()).toBe(200);
  expect(sql(`select enabled from public.notification_preferences np join public.profiles p on p.id = np.user_id where p.email = '${email}'`)).toBe("t");

  await page.goto(`/unsubscribe/${key}`);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You're unsubscribed." })).toBeVisible();
  expect(sql(`select enabled from public.notification_preferences np join public.profiles p on p.id = np.user_id where p.email = '${email}'`)).toBe("f");
});

test("dispatch sends one check-in per local day, however often it runs", async ({ page, request }) => {
  const email = await newUserWithRoutine(page, "dispatch");
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: "Email me a check-in" }).check();
  await page.getByRole("button", { name: "Save check-in settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  // Make today's check-in due now: every day, two minutes ago in the person's time zone.
  sql(`update public.notification_preferences np set days = '{1,2,3,4,5,6,7}',
       preferred_local_time = ((now() at time zone np.timezone) - interval '2 minutes')::time
       from public.profiles p where p.id = np.user_id and p.email = '${email}'`);

  const first = await (await request.post("/api/cron/dispatch", { headers: CRON })).json();
  const second = await (await request.post("/api/cron/dispatch", { headers: CRON })).json();
  expect(first.sent).toBeGreaterThanOrEqual(1);
  expect(second.sent).toBe(0);
  expect(sql(`select count(*) from public.scheduled_jobs j join public.profiles p on p.id = j.user_id where p.email = '${email}' and j.status = 'sent'`)).toBe("1");
});
