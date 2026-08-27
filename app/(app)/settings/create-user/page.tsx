import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { CreateUserSettings } from "@/components/settings/CreateUserSettings";
import { getSession } from "@/lib/auth/session";
import { userCanManageUsers } from "@/lib/teams/teams";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CreateUserPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const canCreate = await userCanManageUsers(session.userId);

  return (
    <SettingsPageShell href="/settings/create-user" title="Create User">
      {canCreate ? (
        <CreateUserSettings />
      ) : (
        <p className="mt-6 max-w-xl text-[13px] text-muted">
          Only team owners and admins can create new users. Ask your team owner
          for access, or use Team settings to invite someone by username.
        </p>
      )}
    </SettingsPageShell>
  );
}
