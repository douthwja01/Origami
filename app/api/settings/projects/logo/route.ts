import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { json, isResponse, requireUser } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { isPreviewableImage } from "@/lib/kinds";
import {
  clearVaultLogo,
  getVaultLogoRecord,
  logoFilename,
  setVaultLogo,
} from "@/lib/project-settings";
import { resolveMaxUploadBytes } from "@/lib/upload-settings";
import {
  absoluteFromStorage,
  relativeVaultSettingsPath,
  removeVaultFile,
  writeVaultSettingsFile,
} from "@/lib/vault";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const logo = await getVaultLogoRecord();
  if (!logo) {
    return json({ error: "No custom vault logo" }, 404);
  }

  const abs = absoluteFromStorage(logo.storagePath);
  let fileStat;
  try {
    fileStat = await stat(abs);
  } catch {
    return json({ error: "Vault logo missing from disk" }, 404);
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": logo.mimeType,
      "Content-Length": String(fileStat.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart form data" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "file is required" }, 400);
  }

  const limit = await resolveMaxUploadBytes();
  if (file.size > limit) {
    return json(
      {
        error: `${formatBytes(file.size)} exceeds the ${formatBytes(limit)} per-file limit`,
      },
      413,
    );
  }

  const filename = logoFilename(file.name || "logo.png");
  const mimeType = file.type || "application/octet-stream";
  if (!isPreviewableImage(mimeType, filename)) {
    return json({ error: "Vault logo must be a previewable image" }, 400);
  }

  try {
    const written = await writeVaultSettingsFile(filename, file.stream());
    const settings = await setVaultLogo({
      mimeType,
      storagePath: written.storagePath,
      contentHash: written.sha256,
    });
    return json({ settings }, 201);
  } catch (error) {
    await removeVaultFile(relativeVaultSettingsPath(filename)).catch(
      () => undefined,
    );
    const statusCode = (error as { status?: number }).status ?? 500;
    return json(
      { error: (error as Error).message || "Upload failed" },
      statusCode,
    );
  }
}

export async function DELETE() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  try {
    const settings = await clearVaultLogo();
    return json({ settings });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
