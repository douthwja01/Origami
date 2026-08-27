import { json, isResponse, requireUser } from "@/lib/shared/api";
import { createProject, listProjects, parseOptionalHttpUrl } from "@/lib/projects/projects";
import { isStatus } from "@/lib/shared/types";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const projects = await listProjects(user.id);
  return json({ projects });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: {
    title?: string;
    startDate?: string;
    status?: string;
    parentId?: string | null;
    code?: string;
    githubUrl?: string | null;
    websiteUrl?: string | null;
    visibility?: string;
    teamId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = body.title?.trim();
  const startDate = body.startDate?.trim();
  if (!title) return json({ error: "Title is required" }, 400);
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return json({ error: "Start date is required (YYYY-MM-DD)" }, 400);
  }
  const status = body.status ?? "planned";
  if (!isStatus(status)) return json({ error: "Invalid status" }, 400);

  let githubUrl: string | null;
  let websiteUrl: string | null;
  try {
    githubUrl = parseOptionalHttpUrl(body.githubUrl, "GitHub URL");
    websiteUrl = parseOptionalHttpUrl(body.websiteUrl, "Website URL");
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }

  try {
    const visibility =
      body.visibility === "personal" || body.visibility === "team"
        ? body.visibility
        : body.parentId
          ? undefined
          : "team";
    const project = await createProject({
      title,
      startDate,
      status,
      parentId: body.parentId || null,
      code: body.code,
      githubUrl,
      websiteUrl,
      userId: user.id,
      visibility,
      teamId: body.teamId ?? null,
    });
    return json({ project }, 201);
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
