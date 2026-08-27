import { randomUUID } from "node:crypto";
import { json, isResponse, requireUser } from "@/lib/shared/api";
import { requireAccessibleProject } from "@/lib/auth/access";
import { normalizeFolderPath } from "@/lib/vault/folder-path";
import { inferKind } from "@/lib/vault/kinds";
import { isHiddenFolderPath } from "@/lib/projects/project-background";
import { insertAsset } from "@/lib/projects/projects";
import { formatBytes } from "@/lib/shared/format";
import { resolveMaxUploadBytes } from "@/lib/settings/upload-settings";
import { removeVaultFile, writeVaultFile } from "@/lib/vault/vault";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;

  const project = await requireAccessibleProject(user, projectId, "edit");
  if (project instanceof Response) return project;

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
