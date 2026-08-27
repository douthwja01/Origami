import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { json, isResponse, requireUser } from "@/lib/api";
import { deleteAssetRow, getAsset, updateAsset } from "@/lib/projects";
import { isKind } from "@/lib/types";
import { absoluteFromStorage, removeVaultFile } from "@/lib/vault";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const asset = await getAsset(id);
  if (!asset) return json({ error: "Asset not found" }, 404);

  const abs = absoluteFromStorage(asset.storagePath);
  let fileStat;
  try {
    fileStat = await stat(abs);
  } catch {
    return json({ error: "File missing from vault" }, 404);
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = asset.filename.replace(/"/g, "");
  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": download
        ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        : `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: { kind?: string; folderPath?: string; filename?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (
    body.kind === undefined &&
    body.folderPath === undefined &&
    body.filename === undefined
  ) {
    return json({ error: "kind, folderPath, or filename is required" }, 400);
  }
  if (body.kind !== undefined && !isKind(body.kind)) {
    return json({ error: "Invalid kind" }, 400);
  }

  try {
    const asset = await updateAsset(id, {
      kind: body.kind,
      folderPath: body.folderPath,
      filename: body.filename,
    });
    return json({ asset });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const asset = await getAsset(id);
  if (!asset) return json({ error: "Asset not found" }, 404);

  await removeVaultFile(asset.storagePath);
  await deleteAssetRow(id);
  return json({ ok: true });
}
