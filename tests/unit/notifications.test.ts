import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCheckinEmail } from "../../src/lib/notifications/email";
import {
  isSendable,
  isoWeekdayOf,
  localDateIn,
  planCheckin,
  zonedTimeToUtc,
  type ReminderPreferences,
} from "../../src/lib/notifications/schedule";
import { signWebhook, verifySignedWebhook } from "../../src/lib/security/webhook";

const base: ReminderPreferences = {
  enabled: true,
  unsubscribedAt: null,
  pausedUntil: null,
  preferredLocalTime: "08:00",
  timezone: "America/Vancouver",
  days: [1, 2, 3, 4, 5, 6, 7],
};

describe("reminder scheduling", () => {
  it("stays disabled until the person opts in", () => {
    assert.equal(planCheckin({ ...base, enabled: false }, new Date("2026-10-09T12:00:00Z")), null);
    assert.equal(planCheckin({ ...base, unsubscribedAt: new Date() }, new Date("2026-10-09T12:00:00Z")), null);
  });

  it("converts local preferred time to UTC", () => {
    const plan = planCheckin(base, new Date("2026-10-09T12:00:00Z"));
    assert.equal(plan?.localDate, "2026-10-09");
    assert.equal(plan?.runAt.toISOString(), "2026-10-09T15:00:00.000Z"); // PDT, UTC-7
  });

  it("uses the person's local date, not the server's, at day boundaries", () => {
    // 06:30 UTC on Oct 10 is still Oct 9 in Vancouver and already Oct 10 in Tokyo.
    const now = new Date("2026-10-10T06:30:00Z");
    assert.equal(localDateIn(now, "America/Vancouver"), "2026-10-09");
    assert.equal(localDateIn(now, "Asia/Tokyo"), "2026-10-10");
    assert.equal(planCheckin({ ...base, timezone: "Asia/Tokyo" }, now)?.runAt.toISOString(), "2026-10-09T23:00:00.000Z");
    assert.equal(localDateIn(new Date("2026-10-09T23:59:00-07:00"), "Pacific/Kiritimati"), "2026-10-10");
  });

  it("handles daylight-saving transitions", () => {
    // Winter time (PST, UTC-8)
    assert.equal(zonedTimeToUtc("2026-12-01", "08:00", "America/Vancouver").toISOString(), "2026-12-01T16:00:00.000Z");
    // Spring-forward gap: 02:30 doesn't exist on 2026-03-08 → 03:30 PDT
    assert.equal(zonedTimeToUtc("2026-03-08", "02:30", "America/Vancouver").toISOString(), "2026-03-08T10:30:00.000Z");
    // Fall-back ambiguity: 01:30 happens twice on 2026-11-01 → earlier (PDT)
    assert.equal(zonedTimeToUtc("2026-11-01", "01:30", "America/Vancouver").toISOString(), "2026-11-01T08:30:00.000Z");
    // Southern hemisphere and half-hour offsets
    assert.equal(zonedTimeToUtc("2026-10-09", "07:00", "Australia/Adelaide").toISOString(), "2026-10-08T20:30:00.000Z");
    assert.equal(zonedTimeToUtc("2026-10-09", "07:00", "Asia/Kathmandu").toISOString(), "2026-10-09T01:15:00.000Z");
  });

  it("respects selected days and pauses", () => {
    const friday = new Date("2026-10-09T12:00:00Z");
    assert.equal(isoWeekdayOf("2026-10-09"), 5);
    assert.equal(planCheckin({ ...base, days: [1, 2, 3, 4] }, friday), null);
    assert.equal(planCheckin({ ...base, pausedUntil: "2026-10-09" }, friday), null);
    assert.notEqual(planCheckin({ ...base, pausedUntil: "2026-10-08" }, friday), null);
  });

  it("ignores invalid time zones and times", () => {
    assert.equal(planCheckin({ ...base, timezone: "Mars/Olympus" }, new Date()), null);
    assert.equal(planCheckin({ ...base, preferredLocalTime: "8am" }, new Date()), null);
  });

  it("only sends within the window", () => {
    const runAt = new Date("2026-10-09T15:00:00Z");
    assert.equal(isSendable(runAt, new Date("2026-10-09T14:59:00Z")), "wait");
    assert.equal(isSendable(runAt, new Date("2026-10-09T15:05:00Z")), "send");
    assert.equal(isSendable(runAt, new Date("2026-10-09T22:00:00Z")), "expired");
  });
});

describe("check-in email", () => {
  it("contains no sensitive content and never links to a state-changing GET", () => {
    const email = buildCheckinEmail({ appUrl: "https://context.example/", unsubscribeKey: "abc123" });
    assert.equal(email.subject, "Your Context check-in");
    const links = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    assert.deepEqual(links.sort(), [
      "https://context.example/settings#reminders",
      "https://context.example/today",
      "https://context.example/unsubscribe/abc123",
    ]);
    assert.match(email.text, /Nothing|check in/);
    assert.doesNotMatch(email.html, /mark (it |this |as )?(done|complete)|complete (it|this)/i);
  });
});

describe("webhook verification", () => {
  const secret = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "m_1" } });
  const now = new Date("2026-10-09T12:00:00Z");
  const ts = Math.floor(now.getTime() / 1000);

  it("accepts a valid signature", () => {
    const signature = signWebhook(secret, "msg_1", ts, body);
    const r = verifySignedWebhook({ secret, rawBody: body, headers: { id: "msg_1", timestamp: String(ts), signature }, now });
    assert.equal(r.ok, true);
  });

  it("rejects tampered bodies, wrong secrets and missing headers", () => {
    const signature = signWebhook(secret, "msg_1", ts, body);
    assert.deepEqual(verifySignedWebhook({ secret, rawBody: body + " ", headers: { id: "msg_1", timestamp: String(ts), signature }, now }), { ok: false, reason: "bad_signature" });
    const other = `whsec_${Buffer.from("ffffffffffffffffffffffffffffffff").toString("base64")}`;
    assert.equal(verifySignedWebhook({ secret: other, rawBody: body, headers: { id: "msg_1", timestamp: String(ts), signature }, now }).ok, false);
    assert.deepEqual(verifySignedWebhook({ secret, rawBody: body, headers: { id: null, timestamp: String(ts), signature }, now }), { ok: false, reason: "missing_headers" });
  });

  it("rejects stale timestamps (replay protection)", () => {
    const old = ts - 10 * 60;
    const signature = signWebhook(secret, "msg_1", old, body);
    assert.deepEqual(verifySignedWebhook({ secret, rawBody: body, headers: { id: "msg_1", timestamp: String(old), signature }, now }), { ok: false, reason: "stale" });
  });
});
