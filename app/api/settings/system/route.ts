import { json, isResponse, requireUser } from "@/lib/shared/api";
import {
  getSystemUploadSettings,
  parseMaxUploadMb,
  updateSystemUploadSettings,
} from "@/lib/settings/upload-settings";
import {
  getSystemVaultSettings,
  parseVaultDir,
  updateSystemVaultSettings,
} from "@/lib/settings/vault-settings";
import { maxUploadMbFromEnv } from "@/lib/settings/upload-limit-env";

export const runtime = "nodejs";

async function systemSettings() {
  const [uploads, vault] = await Promise.all([
    getSystemUploadSettings(),
    getSystemVaultSettings(),
  ]);
  return { ...uploads, ...vault };
}

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const settings = await systemSettings();
  return json({ settings });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let body: { maxUploadMb?: unknown; vaultDir?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.maxUploadMb === undefined && body.vaultDir === undefined) {
    return json({ error: "maxUploadMb or vaultDir is required" }, 400);
  }

  try {
    if (body.maxUploadMb !== undefined) {
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
      await updateSystemUploadSettings({ maxUploadMb });
    }

    if (body.vaultDir !== undefined) {
      if (body.vaultDir !== null && parseVaultDir(body.vaultDir) === false) {
        return json(
          {
            error:
              "Vault location must be a folder path this server can write to",
          },
          400,
        );
      }
      await updateSystemVaultSettings({
        vaultDir: body.vaultDir === null ? null : (body.vaultDir as string),
      });
      const { runStorageReconcile } = await import(
        "@/lib/vault/scan-scheduler"
      );
      await runStorageReconcile({ immediate: true });
    }

    const settings = await systemSettings();
    return json({ settings });
  } catch (error) {
    const statusCode = (error as { status?: number }).status ?? 500;
    return json({ error: (error as Error).message }, statusCode);
  }
}
