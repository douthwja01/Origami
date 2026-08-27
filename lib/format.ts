export function formatBytes(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const rounded =
    value < 10 ? value.toFixed(1) : value < 100 ? value.toFixed(1) : String(Math.round(value));
  return `${rounded} ${units[unit]}`;
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "active":
      return "Active";
    case "on_hold":
      return "On hold";
    case "done":
      return "Done";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "media":
      return "Media";
    case "code":
      return "Code";
    case "document":
      return "Documents";
    case "cad":
      return "CAD";
    default:
      return kind;
  }
}
