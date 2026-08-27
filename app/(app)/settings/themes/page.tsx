import { ThemePicker } from "@/components/settings/ThemePicker";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { SETTINGS_NAV } from "@/lib/settings/nav";
import { getStoredTheme } from "@/lib/settings/theme-settings";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/themes");
  const theme = await getStoredTheme();

  return (
    <SettingsPageShell
      href="/settings/themes"
      title="Themes"
      description={
        <>
          {item?.description}. Colors, wallpaper, glow, and contrast change;
          spacing and structure stay put.
        </>
      }
    >
      <section className="mt-6 max-w-4xl">
        <ThemePicker initialTheme={theme} />
      </section>
    </SettingsPageShell>
  );
}
