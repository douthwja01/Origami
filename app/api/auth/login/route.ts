import { json } from "@/lib/shared/api";
import { authenticateUser } from "@/lib/auth/users";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
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

  const user = await authenticateUser(username, password);
  if (!user) {
    return json({ error: "Invalid username or password" }, 401);
  }

  const session = await getSession();
  session.userId = user.id;
  session.user = user.username;
  await session.save();
  return json({ user: user.username, userId: user.id, displayName: user.displayName });
}
