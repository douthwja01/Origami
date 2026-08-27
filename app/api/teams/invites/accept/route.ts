import { json, isResponse, requireUser } from "@/lib/shared/api";
import { acceptInvite } from "@/lib/teams/teams";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const token = body.token?.trim() ?? "";
  if (!token) {
    return json({ error: "Invite token is required" }, 400);
  }

  try {
    const result = await acceptInvite({ token, password: body.password });

    const session = await getSession();
    if (!session.userId) {
      session.userId = result.userId;
      session.user = result.username;
      await session.save();
    }

    return json({ ok: true, ...result });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}

/** Accept invite when already signed in as the invited username. */
export async function PUT(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const token = body.token?.trim() ?? "";
  if (!token) {
    return json({ error: "Invite token is required" }, 400);
  }

  try {
    const result = await acceptInvite({ token });
    if (result.username !== user.username) {
      return json({ error: "This invite is for a different username" }, 403);
    }
    return json({ ok: true, ...result });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
