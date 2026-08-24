export const SETTINGS_NAV = [
  {
    href: "/settings/backups",
    label: "Backups",
    description: "Download project records and vault files",
  },
] as const;

export function settingsItemForPath(pathname: string) {
  return SETTINGS_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
