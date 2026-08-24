import { json } from "@/lib/api";
import { verifyCredentials } from "@/lib/auth";
import { getSession } from "@/lib/session";

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

  const ok = await verifyCredentials(username, password);
  if (!ok) {
    return json({ error: "Invalid username or password" }, 401);
  }

  const session = await getSession();
  session.user = username;
  await session.save();
  return json({ user: username });
}
