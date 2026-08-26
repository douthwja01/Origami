import { json, isResponse, requireUser } from "@/lib/api";
import { getAsset } from "@/lib/projects";
import { parseTagNames, setAssetTags } from "@/lib/tags";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const asset = await getAsset(id);
  if (!asset) return json({ error: "Asset not found" }, 404);

  let body: { names?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    const names = parseTagNames(body.names);
    const tags = await setAssetTags(id, asset.projectId, names);
    return json({ tags });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
