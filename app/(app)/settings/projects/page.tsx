import { ProjectSettings } from "@/components/settings/ProjectSettings";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

export const dynamic = "force-dynamic";

export default function ProjectsSettingsPage() {
  return (
    <SettingsPageShell href="/settings/projects" title="Projects">
      <ProjectSettings />
    </SettingsPageShell>
  );
}
