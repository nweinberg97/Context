import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { getImport } from "@/lib/domain/imports";
import { getProfile } from "@/lib/domain/profile";
import { getRoutine } from "@/lib/domain/routines";
import { log } from "@/lib/log";
import { renderRoutinePdf, routinePdfFilename } from "@/lib/pdf/routine";
import { rateLimit } from "@/lib/security/ratelimit";

/**
 * The routine as a designed, printable PDF. Read-only, signed-in, and scoped by
 * row-level security: only the owner's approved habits can ever appear in it.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ routineId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (!(await rateLimit("export", viewer.id))) {
    return NextResponse.json({ error: "Too many downloads. Try again in a little while." }, { status: 429 });
  }

  const { routineId } = await params;
  const routine = await getRoutine(viewer.id, routineId);
  if (!routine || routine.status === "draft") {
    return NextResponse.json({ error: "That routine doesn't exist." }, { status: 404 });
  }

  const [profile, source] = await Promise.all([
    getProfile(viewer.id),
    routine.sourceImportId ? getImport(viewer.id, routine.sourceImportId) : Promise.resolve(null),
  ]);
  const compiledOn = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: profile?.timezone ?? "UTC",
  }).format(new Date());

  const bytes = renderRoutinePdf({
    title: routine.title,
    sourceTitle: source?.title ?? null,
    compiledOn,
    habits: routine.habits.filter((h) => h.status === "active"),
  });
  log.info("routine.pdf", { userId: viewer.id, routineId: routine.id, count: bytes.length });

  const inline = new URL(request.url).searchParams.get("view") === "1";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${routinePdfFilename(routine.title)}"`,
      "cache-control": "private, no-store",
    },
  });
}
