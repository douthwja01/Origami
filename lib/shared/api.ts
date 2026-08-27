import { getSession } from "@/lib/auth/session";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function requireUser(): Promise<string | Response> {
  const session = await getSession();
  if (!session.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  return session.user;
}

export function isResponse(value: string | Response): value is Response {
  return typeof value !== "string";
}
