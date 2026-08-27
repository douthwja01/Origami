import { json } from "@/lib/shared/api";
import { getSession } from "@/lib/auth/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return json({ ok: true });
}
