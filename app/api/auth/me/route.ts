import { json, isResponse, requireUser } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  return json({ user });
}
