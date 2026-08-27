import { json, isResponse, requireUser } from "@/lib/api";
import {
  clampMediaBackgroundOpacity,
  isMediaBackgroundMode,
  isMediaBackgroundOpacity,
} from "@/lib/project-settings";
import {
  ancestorsOf,
  childrenOf,
  deleteProject,
  getProjectRow,
  listAssets,
  listFolders,
  listProjects,
  parseOptionalHttpUrl,
  updateProject,
} from "@/lib/projects";
import { listProjectTags } from "@/lib/tags";
import { isStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const row = await getProjectRow(id);
  if (!row) return json({ error: "Project not found" }, 404);

  const all = await listProjects();
  const project = all.find((p) => p.id === id);
  if (!project) return json({ error: "Project not found" }, 404);

  const [ancestors, children, assetList, folderList, tagList] = await Promise.all([
    ancestorsOf(id),
    childrenOf(id),
    listAssets(id),
    listFolders(id),
    listProjectTags(id),
  ]);

  return json({
    project,
    ancestors,
    children,
    assets: assetList,
    folders: folderList,
    tags: tagList,
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: {
    title?: string;
    startDate?: string;
    status?: string;
    parentId?: string | null;
    code?: string;
    githubUrl?: string | null;
    websiteUrl?: string | null;
    mediaBackgroundMode?: unknown;
    mediaBackgroundCycle?: unknown;
    mediaBackgroundOpacity?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.status !== undefined && !isStatus(body.status)) {
    return json({ error: "Invalid status" }, 400);
  }
  if (body.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
    return json({ error: "Invalid start date" }, 400);
  }

  let githubUrl: string | null | undefined;
  let websiteUrl: string | null | undefined;
  try {
    githubUrl =
      body.githubUrl === undefined
        ? undefined
        : parseOptionalHttpUrl(body.githubUrl, "GitHub URL");
    websiteUrl =
      body.websiteUrl === undefined
        ? undefined
        : parseOptionalHttpUrl(body.websiteUrl, "Website URL");
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }

  if (
    body.mediaBackgroundMode !== undefined &&
    !isMediaBackgroundMode(body.mediaBackgroundMode)
  ) {
    return json({ error: "mediaBackgroundMode must be off, vault, or fixed" }, 400);
  }
  if (
    body.mediaBackgroundCycle !== undefined &&
    typeof body.mediaBackgroundCycle !== "boolean"
  ) {
    return json({ error: "mediaBackgroundCycle must be a boolean" }, 400);
  }
  if (
    body.mediaBackgroundOpacity !== undefined &&
    !isMediaBackgroundOpacity(body.mediaBackgroundOpacity)
  ) {
    return json({ error: "Opacity must be a whole number from 0 to 100" }, 400);
  }

  try {
    const project = await updateProject(id, {
      title: body.title,
      startDate: body.startDate,
      status: body.status,
      parentId: body.parentId,
      code: body.code,
      githubUrl,
      websiteUrl,
      mediaBackgroundMode:
        body.mediaBackgroundMode === undefined
          ? undefined
          : body.mediaBackgroundMode,
      mediaBackgroundCycle:
        typeof body.mediaBackgroundCycle === "boolean"
          ? body.mediaBackgroundCycle
          : undefined,
      mediaBackgroundOpacity:
        body.mediaBackgroundOpacity === undefined
          ? undefined
          : clampMediaBackgroundOpacity(Number(body.mediaBackgroundOpacity)),
    });
    return json({ project });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const cascade = url.searchParams.get("cascade") === "1";

  try {
    await deleteProject(id, cascade);
    return json({ ok: true });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
