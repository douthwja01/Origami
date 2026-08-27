import { json, isResponse, requireUser } from "@/lib/shared/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  return json({ user });
}
