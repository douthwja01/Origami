"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import {
  DEFAULT_LOG_LINES,
  LOG_LINE_PRESETS,
  parseLogLineCount,
  type LogSnapshot,
} from "@/lib/log-types";

export function LogsViewer({ initial }: { initial: LogSnapshot }) {
  const [limit, setLimit] = useState(initial.limit || DEFAULT_LOG_LINES);
  const [lines, setLines] = useState(initial.lines);
  const [hostDir, setHostDir] = useState(initial.hostDir);
  const [fileBytes, setFileBytes] = useState(initial.fileBytes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const node = preRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);

  async function load(nextLimit = limit) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/settings/logs?lines=${nextLimit}`);
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not load logs");
      return;
    }
    setLines(data.lines ?? []);
    setLimit(parseLogLineCount(data.limit));
    setHostDir(data.hostDir ?? data.filePath ?? "");
    setFileBytes(Number(data.fileBytes) || 0);
  }

  return (
    <section className="mt-6 flex flex-col rounded-xl border border-line bg-raised p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium">Recent lines</h2>
          <p className="mt-1 text-[12px] text-muted">
            Written outside Docker to{" "}
            <span className="font-mono text-[11px] text-ink">{hostDir}</span>
            {fileBytes > 0 ? ` · ${formatBytes(fileBytes)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-muted">
            Show
            <select
              value={limit}
              disabled={busy}
              onChange={(event) => {
                const next = parseLogLineCount(event.target.value);
                setLimit(next);
                void load(next);
              }}
              className="rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink"
            >
              {LOG_LINE_PRESETS.map((count) => (
                <option key={count} value={count}>
                  last {count}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="rounded-md border border-line px-3 py-1.5 text-[13px] text-muted hover:text-ink disabled:opacity-50"
          >
            {busy ? "Loading…" : "Refresh"}
          </button>
          <a
            href={`/api/settings/logs/download?lines=${limit}`}
            className="inline-flex rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-canvas hover:bg-accent-dim"
          >
            Download
          </a>
        </div>
      </div>
      {error ? <p className="mt-3 text-[13px] text-accent">{error}</p> : null}
      <pre
        ref={preRef}
        className="mt-3 max-h-[min(70vh,40rem)] overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-[12px] leading-5 text-ink"
      >
        {lines.length > 0 ? lines.join("\n") : "No log lines yet."}
      </pre>
    </section>
  );
}
