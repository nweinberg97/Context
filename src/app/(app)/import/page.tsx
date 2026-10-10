import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getPublicStatus } from "@/lib/config";
import { getProfile } from "@/lib/domain/profile";
import { PARSE_LIMITS } from "@/lib/parser";
import { ImportForm } from "./form";

export const metadata: Metadata = { title: "Add advice" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const viewer = await requireViewer();
  const [profile, params] = await Promise.all([getProfile(viewer.id), searchParams]);
  const status = getPublicStatus();
  const first = params.first === "1";

  return (
    <>
      <PageHeader
        title={first ? "Paste your first piece of advice." : "Add advice"}
        lede="Paste the part of an email, message or note with the advice in it. Context suggests habits; you decide which to keep."
      />
      <ImportForm
        maxChars={PARSE_LIMITS.maxBodyChars}
        processor={
          status.extractionExternal
            ? { kind: "external", model: status.extractionModel ?? "AI", acknowledged: Boolean(profile?.aiNoticeAcknowledgedAt) }
            : { kind: "local" }
        }
      />
    </>
  );
}
