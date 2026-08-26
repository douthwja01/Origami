import { ProjectSettings } from "@/components/ProjectSettings";
import { SETTINGS_NAV } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function ProjectsSettingsPage() {
  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/projects");

  return (
    <main className="px-5 py-6 lg:px-8">
      <h1 className="text-[22px] font-medium tracking-tight">Projects</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        {item?.description}.
      </p>
      <ProjectSettings />
    </main>
  );
}
