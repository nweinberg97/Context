import type { Metadata } from "next";
import { signOutAction } from "@/app/(auth)/actions";
import { removeSourceContentAction } from "@/app/(app)/source-actions";
import { ConfirmSubmit, SubmitButton } from "@/components/habits/confirm-button";
import { IconDownload } from "@/components/icons";
import { Notice, PageHeader, buttonClass } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getPublicStatus } from "@/lib/config";
import { listImports } from "@/lib/domain/imports";
import { getProfile, getReminderSettings } from "@/lib/domain/profile";
import { pauseRemindersAction } from "./actions";
import { DeleteAccountForm, RemindersForm, TimezoneForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const [profile, reminders, imports] = await Promise.all([getProfile(viewer.id), getReminderSettings(viewer.id), listImports(viewer.id)]);
  const status = getPublicStatus();
  const storedTexts = imports.filter((i) => i.sanitizedText).length;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6">
        <Section id="account" title="Account">
          <dl className="grid gap-1 text-[0.9375rem]">
            <dt className="font-semibold text-muted">Email</dt>
            <dd className="break-all text-lg font-semibold">{viewer.email ?? "—"}</dd>
          </dl>
          {status.authMode === "local" ? (
            <Notice tone="dev" className="mt-4">Local development account — stored in your local database only.</Notice>
          ) : null}
          <div className="mt-6 border-t border-line pt-6">
            <TimezoneForm timezone={profile?.timezone ?? "UTC"} />
          </div>
          <form action={signOutAction} className="mt-6">
            <SubmitButton variant="secondary" pendingLabel="Signing out…">Sign out</SubmitButton>
          </form>
        </Section>

        <Section id="reminders" title="Check-ins">
          {!status.remindersAvailable ? (
            <Notice tone="warning" className="mb-5">
              Email check-ins aren&rsquo;t configured on this server (no email provider or scheduler). Everything else works;
              you can still set your preferences.
            </Notice>
          ) : null}
          {reminders?.unsubscribedAt && !reminders.enabled ? (
            <Notice tone="info" className="mb-5">You unsubscribed from check-in emails. Turn them back on below whenever you like.</Notice>
          ) : null}
          {reminders ? <RemindersForm settings={reminders} available={status.remindersAvailable} /> : null}
          {reminders?.enabled ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-6">
              {reminders.pausedUntil ? (
                <>
                  <p className="text-[0.9375rem]">Paused through <strong>{reminders.pausedUntil}</strong>.</p>
                  <form action={pauseRemindersAction.bind(null, null)}>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Resuming…">Resume now</SubmitButton>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-[0.9375rem] text-muted">Taking a break?</p>
                  <form action={pauseRemindersAction.bind(null, 7)}>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Pausing…">Pause for a week</SubmitButton>
                  </form>
                </>
              )}
            </div>
          ) : null}
        </Section>

        <Section id="privacy" title="Privacy and your data">
          <div className="grid gap-5 text-[0.9375rem] sm:grid-cols-2">
            <div>
              <h3 className="font-bold">How messages are read</h3>
              <p className="mt-1 text-ink-2">
                {status.extractionExternal
                  ? `Text you paste is sent to ${status.extractionModel} (Anthropic) to find habits. Only the text you paste is sent.`
                  : "This server uses a rule-based reader for development. Pasted text is not sent to any AI provider."}{" "}
                Context stores a cleaned copy so you can see where each habit came from.
              </p>
            </div>
            <div>
              <h3 className="font-bold">Forwarding address</h3>
              <p className="mt-1 text-ink-2">
                A private address you can forward emails to is planned. It isn&rsquo;t available yet — for now, paste the text.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-6">
            <a href="/api/export" className={buttonClass("secondary")} download>
              <IconDownload size={18} /> Export my data
            </a>
            {storedTexts > 0 ? (
              <form action={removeSourceContentAction.bind(null, null)}>
                <ConfirmSubmit
                  size="md"
                  label={`Remove all message text (${storedTexts})`}
                  confirmLabel="Remove all text"
                  question="Remove every stored message? Your habits stay."
                />
              </form>
            ) : (
              <p className="self-center text-[0.9375rem] text-muted">No message text is stored.</p>
            )}
          </div>
        </Section>

        <Section id="delete" title="Delete account" tone="danger">
          <p className="mb-4 text-[0.9375rem] text-ink-2">
            Permanently deletes your account, routines, habits, history, messages and settings. This can&rsquo;t be undone.
            Export your data first if you want a copy.
          </p>
          <DeleteAccountForm />
        </Section>
      </div>
    </>
  );
}

function Section({ id, title, children, tone }: { id: string; title: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={tone === "danger" ? "rounded-[var(--radius-card)] border border-[#e7c4bb] bg-white p-5 sm:p-7" : "card p-5 sm:p-7"}>
      <h2 id={`${id}-title`} className="mb-5 text-heading">{title}</h2>
      {children}
    </section>
  );
}
