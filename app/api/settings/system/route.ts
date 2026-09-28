import { json, isResponse, requireUser } from "@/lib/shared/api";
import {
  getSystemUploadSettings,
  parseMaxUploadMb,
  updateSystemUploadSettings,
} from "@/lib/settings/upload-settings";
import {
  getSystemVaultSettings,
  updateSystemVaultSettings,
  type VaultFileAction,
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

  let body: { maxUploadMb?: unknown; vaultDir?: unknown; smb?: unknown; vaultFiles?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (
    body.maxUploadMb === undefined &&
    body.vaultDir === undefined &&
    body.smb === undefined
  ) {
    return json({ error: "maxUploadMb, vaultDir, or smb is required" }, 400);
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

    const vaultFiles =
      body.vaultFiles === "delete" || body.vaultFiles === "keep"
        ? (body.vaultFiles as VaultFileAction)
        : undefined;
    if (body.vaultFiles !== undefined && !vaultFiles) {
      return json({ error: "Choose how the current vault files are handled" }, 400);
    }

    if (body.smb !== undefined) {
      if (!body.smb || typeof body.smb !== "object") {
        return json({ error: "SMB settings are required" }, 400);
      }
      const smb = body.smb as Record<string, unknown>;
      const text = (key: string) => (typeof smb[key] === "string" ? smb[key] : "");
      await updateSystemVaultSettings({
        fileAction: vaultFiles,
        smb: {
          server: text("server"),
          share: text("share"),
          folder: text("folder"),
          username: text("username"),
          password: text("password"),
        },
      });
    } else if (body.vaultDir !== undefined) {
      await updateSystemVaultSettings({
        fileAction: vaultFiles,
        vaultDir: body.vaultDir === null ? null : (body.vaultDir as string),
      });
    }

    if (body.smb !== undefined || body.vaultDir !== undefined) {
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
