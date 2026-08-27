export const DEFAULT_LOG_LINES = 500;
export const MIN_LOG_LINES = 50;
export const MAX_LOG_LINES = 5000;
export const LOG_LINE_PRESETS = [100, 250, 500, 1000, 2500] as const;

export function parseLogLineCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_LOG_LINES;
  return Math.min(MAX_LOG_LINES, Math.max(MIN_LOG_LINES, n));
}

export type LogSnapshot = {
  lines: string[];
  limit: number;
  filePath: string;
  hostDir: string;
  fileBytes: number;
};
