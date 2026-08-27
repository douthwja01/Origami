import { json, isResponse, requireUser } from "@/lib/shared/api";
import { getProjectRow } from "@/lib/projects/projects";
import { parseTagNames, setFolderTags } from "@/lib/tags/tags";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id: projectId } = await ctx.params;
  const project = await getProjectRow(projectId);
  if (!project) return json({ error: "Project not found" }, 404);

  let body: { path?: unknown; names?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body.path !== "string") {
    return json({ error: "Folder path is required" }, 400);
  }

  try {
    const names = parseTagNames(body.names);
    const tags = await setFolderTags(projectId, body.path, names);
    return json({ tags });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
