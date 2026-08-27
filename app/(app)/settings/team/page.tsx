import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  return (
    <SettingsPageShell href="/settings/team" title="Team">
      <TeamSettings />
    </SettingsPageShell>
  );
}
