import { appendFile, mkdir, open, rename, stat } from "node:fs/promises";
import path from "node:path";
import { format } from "node:util";
import { parseLogLineCount, type LogSnapshot } from "@/lib/log-types";

export {
  DEFAULT_LOG_LINES,
  LOG_LINE_PRESETS,
  MAX_LOG_LINES,
  MIN_LOG_LINES,
  parseLogLineCount,
  type LogSnapshot,
} from "@/lib/log-types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TAIL_BYTES = 2 * 1024 * 1024;

const globalForLogs = globalThis as unknown as {
  origamiLogCapture?: boolean;
  origamiLogWrite?: Promise<void>;
};

function joinLog(...parts: string[]): string {
  const configured = process.env.ORIGAMI_LOG_DIR;
  if (configured) {
    return path.join(/*turbopackIgnore: true*/ configured, ...parts);
  }
  return path.join(process.cwd(), "logs", ...parts);
}

export function logRoot(): string {
  return process.env.ORIGAMI_LOG_DIR || path.join(process.cwd(), "logs");
}

/** Host folder shown in the UI; inside Docker this is ORIGAMI_LOG_HOST. */
export function logHostDir(): string {
  return process.env.ORIGAMI_LOG_HOST || logRoot();
}

export function logFilePath(): string {
  return joinLog("origami.log");
}

function formatMessage(args: unknown[]): string {
  if (args.length === 0) return "";
  return format(...(args as [unknown, ...unknown[]]));
}

function formatLine(level: string, args: unknown[]): string {
  return `${new Date().toISOString()} [${level}] ${formatMessage(args)}`;
}

async function rotateIfNeeded(file: string) {
  try {
    const info = await stat(file);
    if (info.size < MAX_FILE_BYTES) return;
    await rename(file, `${file}.1`);
  } catch {
    // File does not exist yet.
  }
}

async function writeLine(line: string) {
  const dir = logRoot();
  await mkdir(dir, { recursive: true });
  const file = logFilePath();
  await rotateIfNeeded(file);
  await appendFile(file, `${line}\n`, "utf8");
}

function enqueueWrite(line: string) {
  const prior = globalForLogs.origamiLogWrite ?? Promise.resolve();
  globalForLogs.origamiLogWrite = prior.then(() => writeLine(line)).catch(() => {
    // Swallow write errors so logging cannot crash the app.
  });
}

export function installLogCapture() {
  if (globalForLogs.origamiLogCapture) return;
  globalForLogs.origamiLogCapture = true;

  const originals = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  (["log", "info", "warn", "error", "debug"] as const).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      originals[level](...args);
      enqueueWrite(formatLine(level, args));
    };
  });

  enqueueWrite(formatLine("info", ["[origami] log capture started"]));
}

async function tailLines(
  filePath: string,
  maxLines: number,
): Promise<{ lines: string[]; size: number }> {
  let handle;
  try {
    handle = await open(filePath, "r");
  } catch {
    return { lines: [], size: 0 };
  }

  try {
    const { size } = await handle.stat();
    if (size === 0 || maxLines <= 0) return { lines: [], size };

    const chunkSize = 64 * 1024;
    let position = size;
    let text = "";

    while (position > 0 && size - position < MAX_TAIL_BYTES) {
      const readSize = Math.min(chunkSize, position);
      position -= readSize;
      const buf = Buffer.alloc(readSize);
      const { bytesRead } = await handle.read(buf, 0, readSize, position);
      text = buf.subarray(0, bytesRead).toString("utf8") + text;
      const newlineCount = (text.match(/\n/g) ?? []).length;
      if (newlineCount >= maxLines) break;
    }

    const parts = text.split(/\r?\n/);
    if (parts[parts.length - 1] === "") parts.pop();
    if (position > 0 && parts.length > 0) parts.shift();
    return { lines: parts.slice(-maxLines), size };
  } finally {
    await handle.close();
  }
}

export async function readLastLogLines(limit: number): Promise<LogSnapshot> {
  installLogCapture();
  const count = parseLogLineCount(limit);
  const current = logFilePath();
  const fromCurrent = await tailLines(current, count);
  const hostDir = logHostDir();
  if (fromCurrent.lines.length >= count) {
    return {
      lines: fromCurrent.lines,
      limit: count,
      filePath: current,
      hostDir,
      fileBytes: fromCurrent.size,
    };
  }

  const fromRotated = await tailLines(`${current}.1`, count - fromCurrent.lines.length);
  return {
    lines: [...fromRotated.lines, ...fromCurrent.lines],
    limit: count,
    filePath: current,
    hostDir,
    fileBytes: fromCurrent.size,
  };
}
