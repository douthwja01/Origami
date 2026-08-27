import { json, isResponse, requireUser } from "@/lib/shared/api";
import { listTeamsForUser } from "@/lib/teams/teams";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const teams = await listTeamsForUser(user.id);
  return json({ teams });
}
