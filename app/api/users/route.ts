import { json, isResponse, requireUser } from "@/lib/shared/api";
import { createUser } from "@/lib/auth/users";
import { userCanManageUsers } from "@/lib/teams/teams";

export async function POST(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const allowed = await userCanManageUsers(user.id);
  if (!allowed) {
    return json({ error: "Only team owners and admins can create users" }, 403);
  }

  let body: { username?: string; password?: string; displayName?: string | null };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  if (!username || !password) {
    return json({ error: "Username and password are required" }, 400);
  }

  try {
    const created = await createUser({
      username,
      password,
      displayName: body.displayName,
      createdByUserId: user.id,
    });
    return json({ user: created }, 201);
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
