import { randomUUID } from "node:crypto";
import { json, isResponse, requireUser } from "@/lib/shared/api";
import { formatBytes } from "@/lib/shared/format";
import { isPreviewableImage } from "@/lib/vault/kinds";
import { PROJECT_BACKGROUND_FOLDER } from "@/lib/projects/project-background";
import {
  clearBackgroundFolderAssets,
  ensureProjectFolder,
  getProjectRow,
  insertAsset,
  updateProject,
} from "@/lib/projects/projects";
import { resolveMaxUploadBytes } from "@/lib/settings/upload-settings";
import { removeVaultFile, writeVaultFile } from "@/lib/vault/vault";

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

  const filename = file.name || "background";
  const mimeType = file.type || "application/octet-stream";
  if (!isPreviewableImage(mimeType, filename)) {
    return json({ error: "Background must be a previewable image" }, 400);
  }

  const assetId = randomUUID();

  try {
    await ensureProjectFolder(projectId, PROJECT_BACKGROUND_FOLDER);
    await clearBackgroundFolderAssets(projectId);

    const written = await writeVaultFile(
      projectId,
      assetId,
      filename,
      file.stream(),
    );
    const asset = await insertAsset({
      id: assetId,
      projectId,
      kind: "media",
      folderPath: PROJECT_BACKGROUND_FOLDER,
      filename,
      mimeType,
      sizeBytes: written.bytes || file.size,
      storagePath: written.storagePath,
      contentHash: written.sha256,
      reservedFolder: true,
    });

    const updated = await updateProject(projectId, {
      mediaBackgroundMode: "fixed",
      mediaBackgroundAssetId: asset.id,
    });

    return json({ project: updated, asset }, 201);
  } catch (error) {
    await removeVaultFile(`${projectId}/${assetId}/${filename}`).catch(
      () => undefined,
    );
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message || "Upload failed" }, statusCode);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;

  const project = await getProjectRow(projectId);
  if (!project) return json({ error: "Project not found" }, 404);

  try {
    await clearBackgroundFolderAssets(projectId);
    const updated = await updateProject(projectId, {
      mediaBackgroundMode: "off",
      mediaBackgroundAssetId: null,
    });
    return json({ project: updated });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
