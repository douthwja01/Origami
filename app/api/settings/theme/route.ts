import { json, isResponse, requireUser } from "@/lib/api";
import { getStoredTheme, updateStoredTheme } from "@/lib/theme-settings";
import { isThemeId } from "@/lib/themes";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const theme = await getStoredTheme();
  return json({ theme });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: { theme?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!isThemeId(body.theme)) {
    return json({ error: "Unknown theme" }, 400);
  }

  const theme = await updateStoredTheme(body.theme);
  return json({ theme });
}
