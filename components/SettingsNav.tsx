"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV } from "@/lib/settings";
import { useProjectDisplay } from "@/components/ProjectDisplayContext";

function itemIsActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsSidebar() {
  const pathname = usePathname();
  const { settings } = useProjectDisplay();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-3">
        <Link href="/" className="text-[12px] text-muted hover:text-ink">
          ← {settings.vaultName}
        </Link>
        <div className="mt-2 text-[13px] text-ink">Settings</div>
      </div>
      <nav aria-label="Settings" className="border-b border-line px-2 py-2">
        <p className="px-2 pb-1 text-[11px] uppercase tracking-wider text-muted">
          System
        </p>
        {SETTINGS_NAV.map((item) => {
          const active = itemIsActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md px-2 py-1.5 text-[13px] ${
                active
                  ? "bg-overlay text-ink"
                  : "text-muted hover:bg-overlay/60 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
