import { randomUUID } from "node:crypto";
import { json, isResponse, requireUser } from "@/lib/api";
import { inferKind } from "@/lib/kinds";
import { getProjectRow, insertAsset } from "@/lib/projects";
import { resolveMaxUploadBytes } from "@/lib/upload-settings";
import { removeVaultFile, writeVaultFile } from "@/lib/vault";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;

  const project = await getProjectRow(projectId);
  if (!project) return json({ error: "Project not found" }, 404);

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
      { error: `File exceeds the ${Math.round(limit / 1024 / 1024)} MB upload limit` },
      413,
    );
  }

  const kind = inferKind(file.name);

  const folderField = form.get("folderPath");
  const folderPath =
    typeof folderField === "string" ? folderField : "";

  const assetId = randomUUID();
  const filename = file.name || "file";
  const mimeType = file.type || "application/octet-stream";

  try {
    const written = await writeVaultFile(
      projectId,
      assetId,
      filename,
      file.stream(),
    );
    const sizeBytes = written.bytes || file.size;
    const asset = await insertAsset({
      projectId,
      kind,
      folderPath,
      filename,
      mimeType,
      sizeBytes,
      storagePath: written.storagePath,
      contentHash: written.sha256,
    });
    return json({ asset }, 201);
  } catch (error) {
    await removeVaultFile(`${projectId}/${assetId}/${filename}`).catch(
      () => undefined,
    );
    return json({ error: (error as Error).message || "Upload failed" }, 500);
  }
}
