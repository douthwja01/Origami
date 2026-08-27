import { getSession } from "@/lib/auth/session";
import { getUserById, getUserByUsername } from "@/lib/auth/users";
import type { AuthUser } from "@/lib/auth/user-types";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function requireUser(): Promise<AuthUser | Response> {
  const session = await getSession();
  if (!session.userId && session.user) {
    const legacy = await getUserByUsername(session.user);
    if (legacy) {
      session.userId = legacy.id;
      await session.save();
    }
  }
  if (!session.userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  const user = await getUserById(session.userId);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  return user;
}

export function isResponse(value: AuthUser | Response): value is Response {
  return value instanceof Response;
}
