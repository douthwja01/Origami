import { json } from "@/lib/shared/api";
import { getInviteByToken } from "@/lib/teams/teams";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return json({ error: "Invite is invalid or expired" }, 404);
  }
  return json({ invite });
}
