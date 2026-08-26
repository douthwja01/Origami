import { json, isResponse, requireUser } from "@/lib/api";
import {
  getProjectDisplaySettings,
  parseVaultName,
  updateProjectDisplaySettings,
} from "@/lib/project-settings";
import { VAULT_NAME_MAX } from "@/lib/project-settings-types";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const settings = await getProjectDisplaySettings();
  return json({ settings });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: {
    vaultName?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  let vaultName: string | undefined;
  if (body.vaultName !== undefined) {
    const parsed = parseVaultName(body.vaultName);
    if (parsed === null) {
      return json(
        { error: `Vault name must be 1 to ${VAULT_NAME_MAX} characters` },
        400,
      );
    }
    vaultName = parsed;
  }

  const settings = await updateProjectDisplaySettings({
    vaultName,
  });
  return json({ settings });
}
