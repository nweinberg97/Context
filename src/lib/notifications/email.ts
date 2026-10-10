/**
 * Check-in email content. Deliberately minimal: no habit names, no source text and
 * nothing sensitive in the subject line. Links point to pages that require sign-in;
 * the only capability carried in a link is the single-purpose unsubscribe key, and
 * that page changes nothing until the person presses a button (POST).
 */

export interface CheckinEmail {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildCheckinEmail(args: { appUrl: string; unsubscribeKey: string }): CheckinEmail {
  const base = args.appUrl.replace(/\/+$/, "");
  const todayUrl = `${base}/today`;
  const unsubscribeUrl = `${base}/unsubscribe/${encodeURIComponent(args.unsubscribeKey)}`;
  const settingsUrl = `${base}/settings#reminders`;

  const subject = "Your Context check-in";
  const text = [
    "Your routine is ready for today.",
    "",
    `Open Context to check in: ${todayUrl}`,
    "",
    "You're receiving this because you turned on check-ins.",
    `Change reminder settings: ${settingsUrl}`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#F7F6F1;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#263A31">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border:1px solid #E4E6DF;border-radius:16px" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 28px">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#69756D">Context</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">Your routine is ready for today.</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#3F4F46">Take a minute to check in. Nothing is marked from this email.</p>
<a href="${escapeHtml(todayUrl)}" style="display:inline-block;background:#263A31;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Open today</a>
</td></tr></table>
<p style="max-width:480px;margin:20px auto 0;font-size:12px;line-height:1.5;color:#69756D">You're receiving this because you turned on check-ins.
<a href="${escapeHtml(settingsUrl)}" style="color:#69756D">Reminder settings</a> \u00B7
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#69756D">Unsubscribe</a></p>
</td></tr></table></body></html>`;

  return {
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
    },
  };
}
