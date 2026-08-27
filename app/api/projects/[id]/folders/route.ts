import { json, isResponse, requireUser } from "@/lib/shared/api";
import { requireAccessibleProject } from "@/lib/auth/access";
import { normalizeFolderPath } from "@/lib/vault/folder-path";
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
} from "@/lib/projects/projects";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await requireAccessibleProject(user, projectId, "view");
  if (project instanceof Response) return project;
  const folders = await listFolders(projectId);
  return json({ folders });
}

export async function POST(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await requireAccessibleProject(user, projectId, "edit");
  if (project instanceof Response) return project;

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

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await requireAccessibleProject(user, projectId, "edit");
  if (project instanceof Response) return project;

  let body: { path?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const folderPath = normalizeFolderPath(body.path);
  if (!folderPath) {
    return json({ error: "Invalid folder path" }, 400);
  }

  try {
    const folder = await renameFolder(
      projectId,
      folderPath,
      typeof body.name === "string" ? body.name : "",
    );
    return json({ folder });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await requireAccessibleProject(user, projectId, "edit");
  if (project instanceof Response) return project;

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
