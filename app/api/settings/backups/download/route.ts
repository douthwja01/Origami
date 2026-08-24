import { Readable } from "node:stream";
import { json, isResponse, requireUser } from "@/lib/api";
import { createBackupStream } from "@/lib/backup";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  try {
    const { stream, filename } = await createBackupStream();
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return json(
      { error: (error as Error).message || "Could not create backup" },
      500,
    );
  }
}
