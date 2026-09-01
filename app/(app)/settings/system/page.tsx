import { SystemSettings } from "@/components/settings/SystemSettings";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { getSystemUploadSettings } from "@/lib/settings/upload-settings";
import { getSystemVaultSettings } from "@/lib/settings/vault-settings";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const [uploads, vault] = await Promise.all([
    getSystemUploadSettings(),
    getSystemVaultSettings(),
  ]);

  return (
    <SettingsPageShell href="/settings/system" title="System">
      <SystemSettings initialSettings={{ ...uploads, ...vault }} />
    </SettingsPageShell>
  );
}
