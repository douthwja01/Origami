export const SETTINGS_NAV = [
  {
    href: "/settings/themes",
    label: "Themes",
    description: "Assign a visual theme without changing layout",
  },
  {
    href: "/settings/projects",
    label: "Projects",
    description: "Vault name and logo shown on the home screen and in navigation",
  },
  {
    href: "/settings/system",
    label: "System",
    description: "Upload limits and other server defaults",
  },
  {
    href: "/settings/backups",
    label: "Backups",
    description: "Schedule project archives and download a full vault snapshot",
  },
  {
    href: "/settings/logs",
    label: "Logs",
    description: "Inspect recent application output and download a log snippet",
  },
  {
    href: "/settings/account",
    label: "Account",
    description: "Signed-in user and how login credentials are configured",
  },
] as const;

export function settingsItemForPath(pathname: string) {
  return SETTINGS_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
