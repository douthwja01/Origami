import { SystemSettings } from "@/components/settings/SystemSettings";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { getSystemUploadSettings } from "@/lib/settings/upload-settings";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const settings = await getSystemUploadSettings();

  return (
    <SettingsPageShell href="/settings/system" title="System">
      <SystemSettings initialSettings={settings} />
    </SettingsPageShell>
  );
}
