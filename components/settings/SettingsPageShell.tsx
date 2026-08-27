import type { ReactNode } from "react";
import { SETTINGS_NAV } from "@/lib/settings/nav";

export function SettingsPageShell({
  href,
  title,
  description,
  children,
}: {
  href: string;
  title: string;
  /** Overrides the default "{nav description}." copy. */
  description?: ReactNode;
  children?: ReactNode;
}) {
  const item = SETTINGS_NAV.find((entry) => entry.href === href);

  return (
    <main className="px-5 py-6 lg:px-8">
      <h1 className="text-[22px] font-medium tracking-tight">{title}</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        {description ?? <>{item?.description}.</>}
      </p>
      {children}
    </main>
  );
}
