import { SETTINGS_NAV } from "@/lib/settings";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session.user) redirect("/login");

  const item = SETTINGS_NAV.find((entry) => entry.href === "/settings/account");

  return (
    <main className="px-5 py-6 lg:px-8">
      <h1 className="text-[22px] font-medium tracking-tight">Account</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">{item?.description}.</p>

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
    </main>
  );
}
