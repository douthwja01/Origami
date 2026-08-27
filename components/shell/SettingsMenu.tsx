"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV } from "@/lib/settings/nav";

export function SettingsMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Settings"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-overlay hover:text-ink ${
          open || pathname.startsWith("/settings") ? "bg-overlay text-ink" : ""
        }`}
      >
        <IconGear />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-52 rounded-md border border-line bg-raised py-1 shadow-xl"
        >
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted">
            System
          </div>
          {SETTINGS_NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`block px-3 py-2 text-[13px] hover:bg-overlay ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.15" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 2.2v1.5M8 12.3v1.5M2.2 8h1.5M12.3 8h1.5M4.05 4.05l1.05 1.05M10.9 10.9l1.05 1.05M11.95 4.05 10.9 5.1M5.1 10.9l-1.05 1.05"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
