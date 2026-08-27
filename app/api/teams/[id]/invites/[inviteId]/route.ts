import { json, isResponse, requireUser } from "@/lib/shared/api";
import { revokeInvite } from "@/lib/teams/teams";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id, inviteId } = await ctx.params;

  try {
    await revokeInvite({
      teamId: id,
      actorUserId: user.id,
      inviteId,
    });
    return json({ ok: true });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
