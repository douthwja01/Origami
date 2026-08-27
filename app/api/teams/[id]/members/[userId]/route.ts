import { json, isResponse, requireUser } from "@/lib/shared/api";
import { removeTeamMember } from "@/lib/teams/teams";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id, userId } = await ctx.params;

  try {
    await removeTeamMember({
      teamId: id,
      actorUserId: user.id,
      targetUserId: userId,
    });
    return json({ ok: true });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
