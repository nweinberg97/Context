import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { exportPersonalData } from "@/lib/domain/account";
import { rateLimit } from "@/lib/security/ratelimit";

/** Read-only personal data export (JSON download). Requires a signed-in session. */
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });
  if (!(await rateLimit("export", viewer.id))) {
    return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });
  }
  const data = await exportPersonalData(viewer.id);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="context-export-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
