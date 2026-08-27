import { AppShell } from "@/components/shell/AppShell";
import { getProjectDisplaySettings } from "@/lib/settings/project-settings";
import { DEFAULT_PROJECT_DISPLAY_SETTINGS } from "@/lib/settings/project-settings-types";

export const dynamic = "force-dynamic";

export default async function SignedInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialDisplay = DEFAULT_PROJECT_DISPLAY_SETTINGS;
  try {
    initialDisplay = await getProjectDisplaySettings();
  } catch {
    // Fall back to defaults when the database is unavailable at build time.
  }

  return <AppShell initialDisplay={initialDisplay}>{children}</AppShell>;
}
