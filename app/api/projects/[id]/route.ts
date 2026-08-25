import { json, isResponse, requireUser } from "@/lib/api";
import {
  ancestorsOf,
  childrenOf,
  deleteProject,
  getProjectRow,
  listAssets,
  listProjects,
  updateProject,
} from "@/lib/projects";
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

  const [ancestors, children, assetList] = await Promise.all([
    ancestorsOf(id),
    childrenOf(id),
    listAssets(id),
  ]);

  return json({ project, ancestors, children, assets: assetList });
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

  try {
    const project = await updateProject(id, {
      title: body.title,
      startDate: body.startDate,
      status: body.status,
      parentId: body.parentId,
      code: body.code,
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
