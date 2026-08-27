import { json, isResponse, requireUser } from "@/lib/shared/api";
import {
  getSystemUploadSettings,
  parseMaxUploadMb,
  updateSystemUploadSettings,
} from "@/lib/settings/upload-settings";
import { maxUploadMbFromEnv } from "@/lib/settings/upload-limit-env";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const settings = await getSystemUploadSettings();
  return json({ settings });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: { maxUploadMb?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.maxUploadMb === undefined) {
    return json({ error: "maxUploadMb is required" }, 400);
  }

  const ceiling = maxUploadMbFromEnv();
  let maxUploadMb: number | null;
  if (body.maxUploadMb === null) {
    maxUploadMb = null;
  } else {
    const parsed = parseMaxUploadMb(body.maxUploadMb, ceiling);
    if (parsed === null) {
      return json(
        {
          error: `Upload limit must be a whole number from 1 to ${ceiling} MB`,
        },
        400,
      );
    }
    maxUploadMb = parsed;
  }

  try {
    const settings = await updateSystemUploadSettings({ maxUploadMb });
    return json({ settings });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
