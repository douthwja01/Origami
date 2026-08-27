import { json, isResponse, requireUser } from "@/lib/shared/api";
import { inviteToTeam } from "@/lib/teams/teams";
import type { TeamRole } from "@/lib/teams/team-types";

type Ctx = { params: Promise<{ id: string }> };

function isTeamRole(value: string): value is TeamRole {
  return value === "admin" || value === "member";
}

export async function POST(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: { username?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const username = body.username?.trim() ?? "";
  if (!username) {
    return json({ error: "Username is required" }, 400);
  }

  const role = body.role && isTeamRole(body.role) ? body.role : "member";

  try {
    const result = await inviteToTeam({
      teamId: id,
      invitedByUserId: user.id,
      username,
      role,
    });
    return json(
      {
        ...result,
        inviteLink: result.inviteToken
          ? `/accept-invite?token=${result.inviteToken}`
          : undefined,
      },
      result.added ? 200 : 201,
    );
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
