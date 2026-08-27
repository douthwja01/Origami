import { json, isResponse, requireUser } from "@/lib/shared/api";
import { changePassword } from "@/lib/auth/users";

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  if (!currentPassword || !newPassword) {
    return json({ error: "Current and new password are required" }, 400);
  }

  try {
    await changePassword(user.id, currentPassword, newPassword);
    return json({ ok: true });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
