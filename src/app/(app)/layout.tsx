import { AppShell } from "@/components/app/shell";
import { requireViewer } from "@/lib/auth/session";
import { getPublicStatus } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireViewer();
  return <AppShell status={getPublicStatus()}>{children}</AppShell>;
}
