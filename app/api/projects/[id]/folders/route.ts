import { json, isResponse, requireUser } from "@/lib/api";
import { normalizeFolderPath } from "@/lib/folder-path";
import {
  createFolder,
  deleteFolder,
  getProjectRow,
  listFolders,
} from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await getProjectRow(projectId);
  if (!project) return json({ error: "Project not found" }, 404);
  const folders = await listFolders(projectId);
  return json({ folders });
}

export async function POST(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await getProjectRow(projectId);
  if (!project) return json({ error: "Project not found" }, 404);

  let body: { parentPath?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parentPath = normalizeFolderPath(body.parentPath ?? "");
  if (parentPath === null) {
    return json({ error: "Invalid parent folder" }, 400);
  }

  try {
    const folder = await createFolder({
      projectId,
      parentPath,
      name: typeof body.name === "string" ? body.name : "",
    });
    return json({ folder }, 201);
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await getProjectRow(projectId);
  if (!project) return json({ error: "Project not found" }, 404);

  const url = new URL(request.url);
  const normalized = normalizeFolderPath(url.searchParams.get("path"));
  if (!normalized) {
    return json({ error: "Invalid folder path" }, 400);
  }

  try {
    const result = await deleteFolder(projectId, normalized);
    return json({ ok: true, ...result });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
