import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { getSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const user = await getUserById(session.userId);
  if (!user) redirect("/login");

  return (
    <SettingsPageShell href="/settings/account" title="Account">
      <AccountSettings username={user.username} displayName={user.displayName} />
    </SettingsPageShell>
  );
}
