import { json, isResponse, requireUser } from "@/lib/api";
import { createProject, listProjects } from "@/lib/projects";
import { isStatus } from "@/lib/types";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const projects = await listProjects();
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

  try {
    const project = await createProject({
      title,
      startDate,
      status,
      parentId: body.parentId || null,
      code: body.code,
    });
    return json({ project }, 201);
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
