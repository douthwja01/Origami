import { SystemSettings } from "@/components/SystemSettings";
import { SETTINGS_NAV } from "@/lib/settings";
import { getSystemUploadSettings } from "@/lib/upload-settings";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/system");
  const settings = await getSystemUploadSettings();

  return (
    <main className="px-5 py-6 lg:px-8">
      <h1 className="text-[22px] font-medium tracking-tight">System</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        {item?.description}.
      </p>
      <SystemSettings initialSettings={settings} />
    </main>
  );
}
