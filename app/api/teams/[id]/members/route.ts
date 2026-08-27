import { json, isResponse, requireUser } from "@/lib/shared/api";
import { getTeamMembership, listTeamInvites, listTeamMembers } from "@/lib/teams/teams";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const role = await getTeamMembership(id, user.id);
  if (!role) {
    return json({ error: "Forbidden" }, 403);
  }

  const [members, invites] = await Promise.all([
    listTeamMembers(id),
    role === "owner" || role === "admin" ? listTeamInvites(id) : Promise.resolve([]),
  ]);

  return json({ members, invites, role });
}
