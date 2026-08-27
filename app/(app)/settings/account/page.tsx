import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");

  return (
    <SettingsPageShell href="/settings/account" title="Account">
      <section className="mt-6 flex max-w-2xl flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Signed in as</h2>
        <p className="mt-2 font-mono text-[13px]">{session.user}</p>
        <p className="mt-3 text-[13px] text-muted">
          Username and password are set with{" "}
          <span className="font-mono text-[12px]">ORIGAMI_USER</span> and{" "}
          <span className="font-mono text-[12px]">ORIGAMI_PASSWORD</span> or{" "}
          <span className="font-mono text-[12px]">ORIGAMI_PASSWORD_HASH</span>.
        </p>
      </section>
    </SettingsPageShell>
  );
}
