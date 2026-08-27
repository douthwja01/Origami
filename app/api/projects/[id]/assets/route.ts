import { randomUUID } from "node:crypto";
import { json, isResponse, requireUser } from "@/lib/api";
import { normalizeFolderPath } from "@/lib/folder-path";
import { inferKind } from "@/lib/kinds";
import { isHiddenFolderPath } from "@/lib/project-background";
import { getProjectRow, insertAsset } from "@/lib/projects";
import { formatBytes } from "@/lib/format";
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
      {
        error: `${formatBytes(file.size)} exceeds the ${formatBytes(limit)} per-file limit`,
      },
      413,
    );
  }

  const kind = inferKind(file.name);

  const folderField = form.get("folderPath");
  const folderPath =
    typeof folderField === "string" ? folderField : "";
  const normalizedFolder = normalizeFolderPath(folderPath);
  if (normalizedFolder === null) {
    return json({ error: "Invalid folder path" }, 400);
  }
  if (isHiddenFolderPath(normalizedFolder)) {
    return json({ error: "That folder is reserved" }, 403);
  }

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
      id: assetId,
      projectId,
      kind,
      folderPath: normalizedFolder,
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
