const ROOT_PREFIX = "PROJ";
const ROOT_PAD = 3;

export function formatRootProjectCode(n: number): string {
  return `${ROOT_PREFIX}-${String(n).padStart(ROOT_PAD, "0")}`;
}

/** Numeric / dotted stem used for nested IDs, e.g. PROJ-001 → 001. */
export function numberingStem(code: string): string {
  return code.replace(/^(PROJ|ORI)-/i, "");
}

export function nextChildCode(parentCode: string, siblingCodes: string[]): string {
  const stem = numberingStem(parentCode);
  const prefix = `${stem}.`;
  let max = 0;
  for (const code of siblingCodes) {
    const candidate = numberingStem(code);
    if (!candidate.startsWith(prefix)) continue;
    const rest = candidate.slice(prefix.length);
    if (/^\d+$/.test(rest)) {
      max = Math.max(max, Number(rest));
    }
  }
  return `${stem}.${max + 1}`;
}
