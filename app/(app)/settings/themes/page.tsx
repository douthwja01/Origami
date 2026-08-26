import { ThemePicker } from "@/components/ThemePicker";
import { SETTINGS_NAV } from "@/lib/settings";
import { getStoredTheme } from "@/lib/theme-settings";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/themes");
  const theme = await getStoredTheme();

  return (
    <main className="px-5 py-6 lg:px-8">
      <h1 className="text-[22px] font-medium tracking-tight">Themes</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        {item?.description}. Colors, wallpaper, glow, and contrast change;
        spacing and structure stay put.
      </p>

      <section className="mt-6 max-w-4xl">
        <ThemePicker initialTheme={theme} />
      </section>
    </main>
  );
}
